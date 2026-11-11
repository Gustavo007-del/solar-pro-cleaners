import { Languages, Type } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/buttons/Buttons';
import { SelectionCard } from '@/components/forms/Selection';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { Entrance } from '@/components/motion/Entrance';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { useSaveAction } from '@/hooks/useSaveAction';
import type { Locale } from '@/locales/i18n';
import { colors, radius, sizes, spacing, typography } from '@/theme';

const languages = [
  { locale: 'en', label: 'language.english', icon: Type },
  { locale: 'ml', label: 'language.malayalam', icon: Languages },
] as const;

export function LanguageScreen() {
  const { t } = useTranslation();
  const { setLocale } = useAppLanguage();
  const [selected, setSelected] = useState<Locale>();
  const { pending, failed, save } = useSaveAction();

  return (
    <ScreenContainer>
      <ScrollContainer contentContainerStyle={styles.content}>
        <Entrance style={styles.intro}>
          <View style={styles.mark}>
            <Languages size={sizes.icon.lg} color={colors.deep} />
          </View>
          <Text accessibilityRole="header" style={[typography.display, styles.title]}>{t('language.title')}</Text>
          <Text style={[typography.body, styles.description]}>{t('language.description')}</Text>
        </Entrance>

        <Entrance variant="fade" style={styles.options}>
          <View accessibilityRole="radiogroup" style={styles.options}>
            {languages.map(({ locale, label, icon }) => (
              <SelectionCard
                key={locale}
                label={t(label)}
                icon={icon}
                selected={selected === locale}
                disabled={pending}
                onSelect={() => setSelected(locale)}
                style={styles.languageCard}
              />
            ))}
          </View>
        </Entrance>

        <View style={styles.footer}>
          {failed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('error.save')}</Text>}
          <PrimaryButton
            label={t('common.continue')}
            fullWidth
            disabled={!selected}
            loading={pending}
            onPress={() => { if (selected) void save(() => setLocale(selected)); }}
          />
        </View>
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.xl, paddingTop: spacing.xxxl },
  intro: { gap: spacing.xs },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: sizes.input,
    height: sizes.input,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
  },
  title: { color: colors.ink },
  description: { color: colors.muted },
  options: { gap: spacing.sm },
  languageCard: { minHeight: sizes.languageCard },
  footer: { marginTop: 'auto', gap: spacing.xs },
  error: { color: colors.error },
});
