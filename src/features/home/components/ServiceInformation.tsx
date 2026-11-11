import { ClipboardList } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Divider } from '@/components/layout/Containers';
import { SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { colors, sizes, spacing, typography } from '@/theme';

import { serviceInformation } from '../serviceContent';

export function ServiceInformation() {
  const { t } = useTranslation();

  return (
    <AppCard>
      <SectionHeader title={t('home.information.title')} action={<ClipboardList size={sizes.icon.md} color={colors.deep} />} />
      {serviceInformation.map((item, index) => (
        <Fragment key={item}>
          {index > 0 && <Divider />}
          <View style={styles.item}>
            <Text style={[typography.label, styles.label]}>{t(`home.information.${item}.label`)}</Text>
            <Text style={[typography.supporting, styles.value]}>{t(`home.information.${item}.value`)}</Text>
          </View>
        </Fragment>
      ))}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  item: { gap: spacing.xxs },
  label: { color: colors.ink },
  value: { color: colors.muted },
});
