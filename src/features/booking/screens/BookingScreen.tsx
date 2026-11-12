import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useState } from 'react';
import { z } from 'zod';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton, TextButton } from '@/components/buttons/Buttons';
import { AppTextArea, AppTextInput } from '@/components/forms/TextFields';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { useApiMessage } from '@/hooks/useApiMessage';
import { ServiceCatalogue } from '@/features/home/components/ServiceCatalogue';
import { ServicePricing } from '@/features/home/components/ServicePricing';
import { addresses, addressPayload, coverageFields } from '@/services/api/addresses';
import { catalogue } from '@/services/api/catalogue';
import { ApiError } from '@/services/api/client';
import { useSaveAction } from '@/hooks/useSaveAction';
import { useApplication } from '@/providers/ApplicationProvider';
import { bookingService, rememberBookingReceipt, type CreateBookingInput } from '@/services/bookings/bookingService';
import { prepareSubmission, resolveSubmission } from '@/services/bookings/submissionJournal';
import { colors, spacing, typography } from '@/theme';
import { maxBookingInstructions } from '@/types/booking';
import type { CustomerProfile } from '@/types/customerProfile';

import { BookingReview } from '../components/BookingReview';
import { SavedAddressPicker } from '../components/SavedAddressPicker';
import { useBookingResource } from '../hooks/useBookingResource';
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
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  const requestedService = z.uuid().safeParse(serviceId);

  if (profile) return <BookingForm key={profile.customerId} profile={profile}
    initialServiceId={requestedService.success ? requestedService.data : undefined} />;

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

function BookingForm({ profile, initialServiceId }: { profile: CustomerProfile; initialServiceId?: string }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { draft, currentDraft, updateDraft, clearDraft } = useBookingDraft(profile.customerId);
  const locationCapture = useLocationCapture();
  const { pending, failed, error, save } = useSaveAction();
  const message = useApiMessage();
  const serviceId = draft.serviceId ?? initialServiceId;
  const serviceDate = draft.serviceDate ?? '';
  const quantity = draft.panelQuantity ?? '';
  const readService = useCallback(() => catalogue.service(serviceId ?? ''), [serviceId]);
  const service = useBookingResource(serviceId, readService);
  const [check, setCheck] = useState<{ key: string; coverage: string; availability?: string; unavailable: boolean }>();
  const availabilityAction = useSaveAction();
  const saveAddress = useSaveAction();
  const frozen = pending || Boolean(draft.submission);
  const [selectService, setSelectService] = useState(false);
  const selected = getSelectedLocation(draft);
  const confirmedLocation = draft.locationConfirmed ? selected : null;
  const dateValid = z.iso.date().safeParse(serviceDate).success;
  const needsQuantity = service.data?.pricing?.pricing_type === 'per_panel';
  const quantityValid = !needsQuantity || /^[1-9]\d{0,4}$/.test(quantity) && Number(quantity) <= 10000;
  const checkKey = confirmedLocation ? JSON.stringify([serviceId, serviceDate, addressPayload(confirmedLocation)]) : '';
  const availability = check?.key === checkKey ? check : undefined;
  const canReview = Boolean(confirmedLocation && service.data && !service.failed && dateValid && quantityValid)
    && !locationCapture.loading && !availability?.unavailable;
  const detailsConfirmed = draft.detailsConfirmed && draft.confirmedProfileVersion === profile.updatedAt;

  function captureLocation() {
    Keyboard.dismiss();
    updateDraft({ locationConfirmed: false, detailsConfirmed: false, savedAddress: undefined });
    void locationCapture.capture((captured) => updateDraft({ captured, manualAddress: null, addressFields: null }));
  }

  function editAddress() {
    locationCapture.cancelCapture();
    updateDraft({
      editingAddress: true,
      captured: draft.savedAddress && selected?.coordinates ? { coordinates: selected.coordinates, address: selected.address } : draft.captured,
      addressFields: addressToForm(selected?.address),
      locationConfirmed: false,
      detailsConfirmed: false,
    });
  }

  function checkAvailability() {
    if (!confirmedLocation || !serviceId || !dateValid) return;
    const fields = coverageFields(confirmedLocation.address);
    void availabilityAction.save(async () => {
      const [coverage, availability] = await Promise.all([
        addresses.coverage(confirmedLocation),
        fields.postal_code || fields.locality || fields.city || fields.district
          ? catalogue.availability(serviceId, serviceDate, fields) : Promise.resolve(undefined),
      ]);
      setCheck({
        key: checkKey, coverage: coverage.message, availability: availability?.message,
        unavailable: Boolean(availability && !['candidate', 'confirmation_required'].includes(availability.reason)),
      });
    });
  }

  function submitBooking() {
    const current = currentDraft.current;
    const location = getSelectedLocation(current);
    if (!current.submission && (!location || !serviceId || !canReview || !detailsConfirmed)) return;
    void save(async () => {
      Keyboard.dismiss();
      let submission = current.submission;
      if (!submission && location && serviceId) {
        const request: CreateBookingInput = {
          service_id: serviceId, service_date: serviceDate,
          pricing: { panel_quantity: needsQuantity ? Number(quantity) : undefined },
          customer_instructions: current.instructions.trim() || null,
          ...(current.savedAddress ? { saved_address_id: current.savedAddress.id } : { address: addressPayload(location) }),
        };
        submission = { id: await prepareSubmission(profile.customerId, request), request };
      }
      if (!submission) return;
      const submittedDraft = updateDraft({ submission });
      try {
        const booking = await bookingService.createBooking(submission.request, submission.id);
        rememberBookingReceipt(profile.customerId, booking);
        // The server has already committed. A local cleanup failure cannot undo the booking.
        await resolveSubmission(profile.customerId, submission.id).catch(() => undefined);
        clearDraft(submittedDraft);
        if (navigation.isFocused()) router.replace({ pathname: appRoutes.bookingSuccess, params: { bookingId: booking.id } });
      } catch (failure) {
        if (failure instanceof ApiError && failure.status && [400, 403, 404, 409, 413, 422].includes(failure.status)
            && failure.code !== 'idempotency_conflict') {
          await resolveSubmission(profile.customerId, submission.id).catch(() => undefined);
          updateDraft({ submission: undefined });
        }
        throw failure;
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
            {(!serviceId || selectService) && !frozen && <ServiceCatalogue selectedId={serviceId}
              onSelect={(id) => { setSelectService(false); updateDraft({ serviceId: id, detailsConfirmed: false }); }} />}
            {serviceId && <AppCard>
              {service.loading && <Text style={typography.supporting}>{t('common.loading')}</Text>}
              {service.data && !service.failed && <>
                <Text style={typography.section}>{service.data.name}</Text>
                <ServicePricing pricing={service.data.pricing} />
              </>}
              {service.failed && <>
                <Text style={styles.error}>{message(service.error, t('integration.noServices'))}</Text>
                <TextButton label={t('common.retry')} onPress={service.refresh} />
              </>}
              {!frozen && !selectService && <TextButton label={t('integration.services')} onPress={() => setSelectService(true)} />}
            </AppCard>}
            <AppCard>
              <AppTextInput label={t('integration.requestedDate')} value={serviceDate} placeholder="YYYY-MM-DD"
                maxLength={10} editable={!frozen} onChangeText={(value) => updateDraft({ serviceDate: value, detailsConfirmed: false })} />
              <Text style={typography.supporting}>{serviceDate && !dateValid ? t('integration.dateRequired') : t('integration.dateHint')}</Text>
              {needsQuantity && <AppTextInput label={t('integration.panelQuantity')} value={quantity}
                editable={!frozen} keyboardType="number-pad" maxLength={5}
                onChangeText={(value) => updateDraft({ panelQuantity: value, detailsConfirmed: false })} />}
            </AppCard>
            <SavedAddressPicker selected={draft.savedAddress?.id} disabled={frozen} onSelect={(address) => {
              if (currentDraft.current.submission) return;
              locationCapture.cancelCapture();
              updateDraft({ savedAddress: address, captured: null, manualAddress: null, editingAddress: false,
                locationConfirmed: true, detailsConfirmed: false });
            }} />
            <LocationCard
              captured={draft.captured}
              selected={selected}
              confirmed={Boolean(confirmedLocation)}
              capturing={locationCapture.loading}
              failure={locationCapture.failure}
              disabled={frozen}
              onCapture={captureLocation}
              onEdit={editAddress}
              onConfirm={() => {
                if (getSelectedLocation(currentDraft.current)) updateDraft({ locationConfirmed: true, detailsConfirmed: false });
              }}
              editor={draft.editingAddress ? (
                <ManualAddressForm
                  disabled={frozen}
                  defaults={draft.addressFields ?? addressToForm(draft.captured?.address)}
                  onChange={(field, value) => {
                    const current = currentDraft.current;
                    const fields = current.addressFields ?? addressToForm(current.captured?.address);
                    updateDraft({ addressFields: { ...fields, [field]: value } });
                  }}
                  onSave={(manualAddress) => updateDraft({
                    manualAddress,
                    savedAddress: undefined,
                    addressFields: addressToForm(manualAddress),
                    editingAddress: false,
                  })}
                  onCancel={() => { Keyboard.dismiss(); updateDraft({ editingAddress: false, locationConfirmed: Boolean(draft.savedAddress) }); }}
                />
              ) : undefined}
            />
            {confirmedLocation && <AppCard>
              <TextButton label={t('integration.availability')} disabled={frozen || !dateValid || !serviceId || availabilityAction.pending}
                onPress={checkAvailability} />
              {availabilityAction.pending && <Text style={typography.supporting}>{t('common.loading')}</Text>}
              {availabilityAction.failed && <Text style={styles.error}>{message(availabilityAction.error, t('error.description'))}</Text>}
              {availability && <Text style={typography.supporting}>{availability.coverage}</Text>}
              {availability?.availability && <Text style={typography.supporting}>{availability.availability}</Text>}
              {!draft.savedAddress && <TextButton label={t('integration.saveAddress')} disabled={frozen || saveAddress.pending}
                onPress={() => { void saveAddress.save(async () => {
                  const saved = await addresses.create(confirmedLocation);
                  if (!currentDraft.current.submission && getSelectedLocation(currentDraft.current)?.address === confirmedLocation.address)
                    updateDraft({ savedAddress: saved });
                }); }} />}
              {saveAddress.failed && <Text style={styles.error}>{message(saveAddress.error, t('error.save'))}</Text>}
            </AppCard>}
            <AppCard>
              <AppTextArea
                label={t('booking.instructions.label')}
                placeholder={t('booking.instructions.placeholder')}
                hint={t('booking.instructions.count', { used: draft.instructions.length, max: maxBookingInstructions })}
                value={draft.instructions}
                editable={!frozen}
                maxLength={maxBookingInstructions}
                onChangeText={(instructions) => updateDraft({ instructions, detailsConfirmed: false })}
              />
            </AppCard>
            <CustomerDetailsCard details={profile} action={
              <TextButton
                label={t('booking.customer.edit')}
                compact
                disabled={frozen}
                onPress={() => {
                  updateDraft({ detailsConfirmed: false });
                  router.dismissTo(appRoutes.profile);
                }}
              />
            } />
            <Entrance key={confirmedLocation ? 'confirmed' : 'unconfirmed'} variant="fade">
              <BookingReview
                profile={profile}
                serviceName={service.data?.name}
                serviceDate={serviceDate}
                location={confirmedLocation}
                instructions={draft.instructions}
                checked={detailsConfirmed}
                disabled={!canReview || frozen}
                onCheck={(checked) => updateDraft({ detailsConfirmed: checked, confirmedProfileVersion: checked ? profile.updatedAt : undefined })}
              />
            </Entrance>
          </Entrance>

          <View style={styles.footer}>
            {failed && (
              <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{message(error, t('booking.submitError'))}</Text>
            )}
            {draft.submission && !pending && <Text style={typography.supporting}>{t('integration.retrySameBooking')}</Text>}
            <PrimaryButton
              label={t(draft.submission ? 'common.retry' : 'booking.submit')}
              loadingLabel={t('booking.submitting')}
              disabled={!draft.submission && (!canReview || !detailsConfirmed || saveAddress.pending)}
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
