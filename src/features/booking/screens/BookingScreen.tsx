import { router, useNavigation } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton, TextButton } from '@/components/buttons/Buttons';
import { AppTextArea } from '@/components/forms/TextFields';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { useSaveAction } from '@/hooks/useSaveAction';
import { useApplication } from '@/providers/ApplicationProvider';
import { bookingService, createBookingSubmissionId } from '@/services/bookings/bookingService';
import { colors, spacing, typography } from '@/theme';
import { maxBookingInstructions, solarCleaningService, type BookingRequest } from '@/types/booking';
import type { CustomerProfile } from '@/types/customerProfile';

import { BookingReview } from '../components/BookingReview';
import { BookingServiceCard } from '../components/BookingServiceCard';
import { CustomerDetailsCard } from '../components/CustomerDetailsCard';
import { LocationCard } from '../components/LocationCard';
import { ManualAddressForm } from '../components/ManualAddressForm';
import { getSelectedLocation, useBookingDraft } from '../hooks/useBookingDraft';
import { useLocationCapture } from '../hooks/useLocationCapture';
import { addressToForm } from '../schemas/addressSchema';

function leaveBooking() {
  if (router.canGoBack()) router.back();
  else router.replace(appRoutes.home);
}

export function BookingScreen() {
  const { profile } = useApplication();
  const { t } = useTranslation();

  if (profile) return <BookingForm key={profile.customerId} profile={profile} />;

  return (
    <ScreenContainer>
      <AppHeader title={t('booking.title')} onBack={leaveBooking} />
      <ScrollContainer>
        <AppCard>
          <Text style={[typography.body, styles.supporting]}>{t('booking.customer.missing')}</Text>
          <PrimaryButton label={t('booking.customer.edit')} onPress={() => router.dismissTo(appRoutes.profile)} />
        </AppCard>
      </ScrollContainer>
    </ScreenContainer>
  );
}

function BookingForm({ profile }: { profile: CustomerProfile }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { draft, currentDraft, updateDraft, clearDraft } = useBookingDraft(profile.customerId);
  const locationCapture = useLocationCapture();
  const { pending, failed, save } = useSaveAction();
  const selected = getSelectedLocation(draft);
  const confirmedLocation = draft.locationConfirmed ? selected : null;
  const canReview = Boolean(confirmedLocation) && !locationCapture.loading;
  const detailsConfirmed = draft.detailsConfirmed && draft.confirmedProfileVersion === profile.updatedAt;

  function captureLocation() {
    Keyboard.dismiss();
    updateDraft({ locationConfirmed: false, detailsConfirmed: false });
    void locationCapture.capture((captured) => updateDraft({ captured }));
  }

  function editAddress() {
    locationCapture.cancelCapture();
    updateDraft({
      editingAddress: true,
      locationConfirmed: false,
      detailsConfirmed: false,
    });
  }

  function submitBooking() {
    const current = currentDraft.current;
    const location = getSelectedLocation(current);
    if (!location || !current.locationConfirmed || !current.detailsConfirmed ||
        current.confirmedProfileVersion !== profile.updatedAt || locationCapture.loading) return;

    void save(async () => {
      Keyboard.dismiss();
      const submissionId = current.submissionId ?? createBookingSubmissionId();
      const submittedDraft = updateDraft({ submissionId });
      const request: BookingRequest = {
        customerId: profile.customerId,
        serviceType: solarCleaningService,
        customerName: profile.fullName,
        primaryPhone: profile.primaryPhone,
        alternatePhone: profile.alternatePhone ?? null,
        location,
        additionalInstructions: current.instructions.trim() || null,
      };

      const booking = await bookingService.createBooking(request, submissionId);
      clearDraft(submittedDraft);
      if (navigation.isFocused()) {
        router.replace({ pathname: appRoutes.bookingSuccess, params: { bookingId: booking.id } });
      }
    });
  }

  return (
    <ScreenContainer>
      <AppHeader title={t('booking.title')} onBack={pending ? undefined : leaveBooking} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollContainer keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
          <Entrance style={styles.content}>
            <Text style={[typography.body, styles.supporting]}>{t('booking.description')}</Text>
            <BookingServiceCard />
            <LocationCard
              captured={draft.captured}
              selected={selected}
              confirmed={Boolean(confirmedLocation)}
              capturing={locationCapture.loading}
              failure={locationCapture.failure}
              disabled={pending}
              onCapture={captureLocation}
              onEdit={editAddress}
              onConfirm={() => {
                if (getSelectedLocation(currentDraft.current)) updateDraft({ locationConfirmed: true, detailsConfirmed: false });
              }}
              editor={draft.editingAddress ? (
                <ManualAddressForm
                  defaults={draft.addressFields ?? addressToForm(draft.captured?.address)}
                  onChange={(field, value) => {
                    const current = currentDraft.current;
                    const fields = current.addressFields ?? addressToForm(current.captured?.address);
                    updateDraft({ addressFields: { ...fields, [field]: value } });
                  }}
                  onSave={(manualAddress) => updateDraft({
                    manualAddress,
                    addressFields: addressToForm(manualAddress),
                    editingAddress: false,
                  })}
                  onCancel={() => { Keyboard.dismiss(); updateDraft({ editingAddress: false }); }}
                />
              ) : undefined}
            />
            <AppCard>
              <AppTextArea
                label={t('booking.instructions.label')}
                placeholder={t('booking.instructions.placeholder')}
                hint={t('booking.instructions.count', { used: draft.instructions.length, max: maxBookingInstructions })}
                value={draft.instructions}
                editable={!pending}
                maxLength={maxBookingInstructions}
                onChangeText={(instructions) => updateDraft({ instructions, detailsConfirmed: false })}
              />
            </AppCard>
            <CustomerDetailsCard details={profile} action={
              <TextButton
                label={t('booking.customer.edit')}
                compact
                disabled={pending}
                onPress={() => {
                  updateDraft({ detailsConfirmed: false });
                  router.dismissTo(appRoutes.profile);
                }}
              />
            } />
            <Entrance key={confirmedLocation ? 'confirmed' : 'unconfirmed'} variant="fade">
              <BookingReview
                profile={profile}
                location={confirmedLocation}
                instructions={draft.instructions}
                checked={detailsConfirmed}
                disabled={!canReview || pending}
                onCheck={(checked) => updateDraft({ detailsConfirmed: checked, confirmedProfileVersion: checked ? profile.updatedAt : undefined })}
              />
            </Entrance>
          </Entrance>

          <View style={styles.footer}>
            {failed && (
              <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('booking.submitError')}</Text>
            )}
            <PrimaryButton
              label={t('booking.submit')}
              loadingLabel={t('booking.submitting')}
              disabled={!canReview || !detailsConfirmed}
              loading={pending}
              fullWidth
              onPress={submitBooking}
            />
          </View>
        </ScrollContainer>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.md },
  footer: { gap: spacing.xs },
  supporting: { color: colors.muted },
  error: { color: colors.error },
});
