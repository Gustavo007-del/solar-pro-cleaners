import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { LocateFixed } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { OutlineButton, PrimaryButton, TextButton } from '@/components/buttons/Buttons';
import { AppTextArea, AppTextInput } from '@/components/forms/TextFields';
import { Divider, ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { ServicePricing } from '@/features/home/components/ServicePricing';
import { useApiMessage } from '@/hooks/useApiMessage';
import { usePagedResource } from '@/hooks/usePagedResource';
import { useSaveAction } from '@/hooks/useSaveAction';
import { useApplication } from '@/providers/ApplicationProvider';
import { catalogue, type Service } from '@/services/api/catalogue';
import { ApiError } from '@/services/api/client';
import { bookingService, rememberBookingReceipt, type CreateBookingInput } from '@/services/bookings/bookingService';
import { prepareSubmission, resolveSubmission } from '@/services/bookings/submissionJournal';
import { colors, spacing, typography } from '@/theme';
import { maxBookingInstructions } from '@/types/booking';
import type { CustomerProfile } from '@/types/customerProfile';

import { BookingDateField } from '../components/BookingDateField';
import { SavedAddressPicker } from '../components/SavedAddressPicker';
import { bookingAddressFields, useBookingDraft } from '../hooks/useBookingDraft';
import { useBookingResource } from '../hooks/useBookingResource';
import { useLocationCapture } from '../hooks/useLocationCapture';
import { parseBookingDate } from '../utils/bookingDate';

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
          <Text style={typography.body}>{t('booking.customer.missing')}</Text>
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
  const location = useLocationCapture();
  const { pending, failed, error, save } = useSaveAction();
  const message = useApiMessage();
  const services = usePagedResource<Service, Awaited<ReturnType<typeof catalogue.services>>>(catalogue.services);
  const preferredId = draft.serviceId ?? initialServiceId;
  const serviceId = services.data?.first.total === 1 ? services.data.items[0]?.id : preferredId;
  const readService = useCallback(() => catalogue.service(serviceId ?? ''), [serviceId]);
  const service = useBookingResource(serviceId, readService);
  const [showServices, setShowServices] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showNotes, setShowNotes] = useState(Boolean(draft.instructions));
  const [settingsError, setSettingsError] = useState(false);
  const frozen = pending || Boolean(draft.submission);
  const dateText = draft.serviceDate ?? '';
  const serviceDate = parseBookingDate(dateText);
  const quantity = draft.panelQuantity ?? '';
  const needsQuantity = service.data?.pricing?.pricing_type === 'per_panel';
  const quantityValid = !needsQuantity || /^[1-9]\d{0,4}$/.test(quantity) && Number(quantity) <= 10000;
  const canSubmit = Boolean(serviceId && service.data && !service.failed && quantityValid && (!dateText.trim() || serviceDate));
  const hasGps = Boolean(draft.captured);
  const showSettings = location.failure === 'permissionDenied' || location.failure === 'permissionBlocked'
    || location.failure === 'servicesDisabled';
  const showServiceChoices = !serviceId || showServices || service.failed;
  const chooseAnother = (services.data?.first.total ?? 0) > 1;

  function captureLocation() {
    Keyboard.dismiss();
    setSettingsError(false);
    void location.capture((captured) => {
      const previous = currentDraft.current;
      if (previous.submission) return;
      const typedAddress = previous.savedAddress || previous.addressText === previous.captured?.address?.formattedAddress
        ? '' : previous.addressText;
      updateDraft({ captured, savedAddress: undefined,
        addressText: captured.address?.formattedAddress ?? typedAddress });
    });
  }

  async function openSettings() {
    setSettingsError(false);
    try {
      if (location.failure === 'servicesDisabled' && Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
      } else {
        await Linking.openSettings();
      }
    } catch {
      setSettingsError(true);
    }
  }

  function submitBooking() {
    const current = currentDraft.current;
    if (!current.submission && (!serviceId || !canSubmit)) return;
    location.cancelCapture();
    void save(async () => {
      Keyboard.dismiss();
      let submission = current.submission;
      if (!submission && serviceId) {
        const request: CreateBookingInput = {
          service_id: serviceId, service_date: serviceDate,
          pricing: { panel_quantity: needsQuantity ? Number(quantity) : undefined },
          customer_instructions: current.instructions.trim() || null,
          ...bookingAddressFields(current),
        };
        submission = { id: await prepareSubmission(profile.customerId, request), request };
      }
      if (!submission) return;
      const submittedDraft = updateDraft({ submission });
      try {
        const booking = await bookingService.createBooking(submission.request, submission.id);
        rememberBookingReceipt(profile.customerId, booking);
        await resolveSubmission(profile.customerId, submission.id).catch(() => undefined);
        clearDraft(submittedDraft);
        if (navigation.isFocused()) router.replace({ pathname: appRoutes.bookingSuccess, params: { bookingId: booking.id } });
      } catch (failure) {
        if (failure instanceof ApiError && failure.status && [400, 403, 404, 409, 413, 422].includes(failure.status)
            && failure.code !== 'idempotency_conflict') {
          await resolveSubmission(profile.customerId, submission.id).catch(() => undefined);
          updateDraft({ submission: undefined });
          if (failure.code === 'service_not_found') {
            service.refresh();
            void services.refresh();
          }
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
          <AppCard style={styles.card}>
            {service.data && !service.failed ? <>
              <Text accessibilityRole="header" style={typography.section}>{service.data.name}</Text>
              <ServicePricing pricing={service.data.pricing} />
              {needsQuantity && <AppTextInput label={t('integration.panelQuantity')} value={quantity}
                editable={!frozen} keyboardType="number-pad" maxLength={5}
                error={quantity && !quantityValid ? t('booking.form.quantityError') : undefined}
                onChangeText={(panelQuantity) => updateDraft({ panelQuantity })} />}
              {chooseAnother && !showServices && <TextButton label={t('booking.form.changeService')}
                disabled={frozen} onPress={() => setShowServices(true)} />}
            </> : (service.loading || services.loading) && <Text style={typography.supporting}>{t('common.loading')}</Text>}
            {service.failed && <View style={styles.group}>
              <Text accessibilityLiveRegion="polite" style={styles.error}>{message(service.error, t('booking.form.serviceLoadError'))}</Text>
              <TextButton label={t('common.retry')} disabled={frozen} onPress={service.refresh} />
            </View>}
            {showServiceChoices && !frozen && <>
              {services.data && services.data.first.total > 1 &&
                <Text accessibilityRole="header" style={typography.label}>{t('booking.form.chooseService')}</Text>}
              {!serviceId && services.data?.first.total === 0 && <>
                <Text style={typography.body}>{t('integration.noServices')}</Text>
                <TextButton label={t('common.retry')} onPress={() => { void services.refresh(); }} />
              </>}
              {services.error != null && <>
                <Text style={styles.error}>{message(services.error, t('booking.form.serviceLoadError'))}</Text>
                <TextButton label={t('common.retry')} onPress={() => { void (services.data ? services.loadMore() : services.refresh()); }} />
              </>}
              {services.data?.items.filter((item) => item.id !== serviceId).map((item) => (
                <OutlineButton key={item.id} label={item.name} onPress={() => {
                  updateDraft({ serviceId: item.id, panelQuantity: '' });
                  setShowServices(false);
                }} />
              ))}
              {services.data?.hasNext && <TextButton label={t('integration.loadMore')} disabled={services.more}
                onPress={() => { void services.loadMore(); }} />}
            </>}
          </AppCard>

          <AppCard style={styles.card}>
            <Text style={typography.supporting}>{t('booking.form.followUpHint')}</Text>
            <BookingDateField value={dateText} disabled={frozen}
              onChange={(serviceDate) => updateDraft({ serviceDate })} />
            <Divider />
            <AppTextArea label={t('booking.form.optionalAddress')} placeholder={t('booking.form.addressPlaceholder')}
              value={draft.addressText} maxLength={800} editable={!frozen} style={styles.address}
              onChangeText={(addressText) => {
                location.cancelCapture();
                setSettingsError(false);
                updateDraft({ addressText, savedAddress: undefined });
              }} />
            <OutlineButton icon={LocateFixed} label={t('booking.form.useLocation')} disabled={frozen}
              loading={location.loading} loadingLabel={t('booking.location.getting')} onPress={captureLocation} />
            {hasGps && <Text accessibilityLiveRegion="polite" style={typography.supporting}>{t('booking.form.gpsAdded')}</Text>}
            {location.failure && <Text accessibilityLiveRegion="polite" style={typography.supporting}>
              {t(`booking.location.failure.${location.failure}`)}
            </Text>}
            {showSettings && <OutlineButton label={t('booking.location.settings')} disabled={frozen}
              onPress={() => { void openSettings(); }} />}
            {settingsError && <Text accessibilityLiveRegion="polite" style={styles.error}>{t('booking.location.settingsError')}</Text>}
            <View style={styles.actions}>
              <TextButton label={t(showSaved ? 'booking.form.hideSaved' : 'integration.savedAddresses')}
                disabled={frozen} onPress={() => setShowSaved(!showSaved)} />
              {(hasGps || draft.addressText.trim() !== '') && <TextButton label={t('booking.form.clearLocation')}
                disabled={frozen} onPress={() => {
                  location.cancelCapture();
                  setSettingsError(false);
                  updateDraft({ captured: null, addressText: '', savedAddress: undefined });
                }} />}
            </View>
            {showSaved && !frozen && <SavedAddressPicker selected={draft.savedAddress?.id} disabled={frozen} onSelect={(address) => {
              if (currentDraft.current.submission) return;
              location.cancelCapture();
              setSettingsError(false);
              updateDraft({ savedAddress: address, captured: null, addressText: address.address_line });
              setShowSaved(false);
            }} />}
          </AppCard>

          <AppCard style={styles.card}>
            {showNotes ? <AppTextArea label={t('booking.instructions.label')} style={styles.address} value={draft.instructions}
              editable={!frozen} maxLength={maxBookingInstructions} onChangeText={(instructions) => updateDraft({ instructions })} />
              : <TextButton label={t('booking.form.addNotes')} disabled={frozen} onPress={() => setShowNotes(true)} />}
            <Text style={typography.supporting}>{t('booking.form.contactNumber', { phone: profile.primaryPhone })}</Text>
          </AppCard>

          <View style={styles.group}>
            {failed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>
              {message(error, t('booking.submitError'))}
            </Text>}
            {draft.submission && !pending && <Text style={typography.supporting}>{t('integration.retrySameBooking')}</Text>}
            <PrimaryButton label={t(draft.submission ? 'common.retry' : 'booking.submit')} loadingLabel={t('booking.submitting')}
              disabled={!draft.submission && !canSubmit} loading={pending} fullWidth onPress={submitBooking} />
          </View>
        </ScrollContainer>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.sm, paddingTop: spacing.sm },
  card: { gap: spacing.xs },
  group: { gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xs },
  address: { minHeight: 64 },
  error: { color: colors.error },
});
