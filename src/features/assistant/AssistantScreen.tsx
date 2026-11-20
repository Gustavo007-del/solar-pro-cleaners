import { randomUUID } from 'expo-crypto';
import { ArrowUp, History, MessageCirclePlus, RotateCcw, Sparkles, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { IconButton, OutlineButton, TextButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { useApiMessage } from '@/hooks/useApiMessage';
import { useScreenLayout } from '@/hooks/useScreenLayout';
import { assistant, type AssistantConversation, type AssistantMessage, type AssistantTurn } from '@/services/api/assistant';
import { ApiError } from '@/services/api/client';
import { colors, radius, sizes, spacing, typography } from '@/theme';
import { backOrReplace } from '@/utils/navigation';

const suggestions = ['assistant.suggestFrequency', 'assistant.suggestBooking', 'assistant.suggestServices'] as const;
const maxQuestionLength = 1000;

type Operation = 'send' | 'regenerate' | 'open' | 'older' | 'history' | 'clear';
type Attempt = { id: string; kind: 'send'; content: string } | { id: string; kind: 'regenerate' };

export function AssistantScreen() {
  const { t, i18n } = useTranslation();
  const apiMessage = useApiMessage();
  const { screenMargin } = useScreenLayout();
  const scroll = useRef<ScrollView>(null);
  const scrollToLatest = useRef(false);
  const running = useRef(false);
  const [busy, setBusy] = useState<Operation>();
  const [failure, setFailure] = useState<{ error: unknown; retry?: () => void }>();
  const [conversation, setConversation] = useState<AssistantConversation>();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [older, setOlder] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [attempt, setAttempt] = useState<Attempt>();
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<AssistantConversation[]>([]);
  const [nextPage, setNextPage] = useState<number>();

  async function run(operation: Operation, action: () => Promise<void>, retry?: () => void) {
    if (running.current) return;
    running.current = true;
    setBusy(operation);
    setFailure(undefined);
    try {
      await action();
    } catch (error) {
      setFailure({ error, retry });
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }

  function replaceChat(id: string, keepDraft = false) {
    const open = () => run('open', async () => {
      const result = await assistant.messages(id);
      scrollToLatest.current = true;
      setConversation(result.conversation);
      setMessages(result.items);
      setOlder(result.next_before);
      if (!keepDraft) setDraft('');
      setAttempt(undefined);
      setShowHistory(false);
    }, () => { void open(); });
    void open();
  }

  function loadOlder(current: AssistantConversation, cursor: number) {
    void run('older', async () => {
      const result = await assistant.messages(current.id, cursor);
      if (result.conversation.revision !== current.revision) {
        throw new ApiError('assistant_conflict', 'The conversation changed.', 409);
      }
      setMessages((existing) => [...result.items, ...existing]);
      setOlder(result.next_before);
    }, () => loadOlder(current, cursor));
  }

  function loadHistory(page = 1) {
    setShowHistory(true);
    void run('history', async () => {
      const result = await assistant.conversations(page);
      setHistory((existing) => page === 1 ? result.items : [...existing, ...result.items]);
      setNextPage(result.has_next ? page + 1 : undefined);
    }, () => loadHistory(page));
  }

  function newChat() {
    if (running.current) return;
    setConversation(undefined);
    setMessages([]);
    setOlder(null);
    setDraft('');
    setAttempt(undefined);
    setFailure(undefined);
    setShowHistory(false);
  }

  async function applyTurn(result: AssistantTurn) {
    if (result.conversation.revision !== (conversation?.revision ?? 0) + 1) {
      const latest = await assistant.messages(result.conversation.id);
      setMessages(latest.items);
      setOlder(latest.next_before);
      setConversation(latest.conversation);
    } else {
      setMessages((existing) => {
        const start = result.messages[0]?.position;
        return [...existing.filter((item) => start === undefined || item.position < start), ...result.messages];
      });
      setConversation(result.conversation);
    }
    scrollToLatest.current = true;
    setDraft('');
    setAttempt(undefined);
  }

  function generate(request: Attempt) {
    const current = conversation;
    if (running.current || (request.kind === 'regenerate' && !current)) return;
    Keyboard.dismiss();
    scrollToLatest.current = true;
    setAttempt(request);
    void run(request.kind, async () => {
      if (request.kind === 'send') {
        await applyTurn(await assistant.send(request.id, current?.id, request.content));
      } else if (current) {
        await applyTurn(await assistant.regenerate(request.id, current));
      }
    }, () => generate(request));
  }

  function send() {
    const content = draft.trim();
    if (!content) return;
    const request = attempt?.kind === 'send' && attempt.content === content
      ? attempt : { id: randomUUID(), kind: 'send' as const, content };
    generate(request);
  }

  function clear(current: AssistantConversation) {
    const clearAction = () => run('clear', async () => {
      try {
        await assistant.clear(current.id);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'conversation_not_found') throw error;
      }
      setConversation(undefined);
      setMessages([]);
      setOlder(null);
      setDraft('');
      setAttempt(undefined);
    }, () => { void clearAction(); });

    Alert.alert(t('assistant.clear'), t('assistant.clearPrompt'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('assistant.clear'), style: 'destructive', onPress: () => { void clearAction(); } },
    ]);
  }

  const errorCode = failure?.error instanceof ApiError ? failure.error.code : undefined;
  const regenerating = busy === 'regenerate';
  const generating = busy === 'send' || regenerating;
  const pendingMessage = generating && attempt?.kind === 'send' ? attempt.content : undefined;
  const historyBusy = busy === 'history' || busy === 'open';
  const errorText = failure && (
    errorCode === 'assistant_quota' ? t('assistant.quota')
      : errorCode === 'assistant_rate_limited' ? t('assistant.rate')
      : errorCode === 'assistant_conflict' ? t('assistant.conflict')
      : errorCode === 'assistant_history_full' ? t('assistant.historyFull')
      : errorCode === 'assistant_conversation_full' ? t('assistant.conversationFull')
      : errorCode === 'assistant_unavailable' || errorCode === 'http_error' ? t('assistant.unavailable')
      : errorCode === 'assistant_timeout' || errorCode === 'timeout' ? t('assistant.timeout')
      : apiMessage(failure.error, t('assistant.failed'))
  );
  const errorBlock = failure && (
    <View style={styles.errorCard}>
      <Text accessibilityLiveRegion="polite" style={styles.error}>{errorText}</Text>
      {errorCode === 'assistant_conflict' && conversation
        ? <TextButton label={t('assistant.reload')} onPress={() => replaceChat(conversation.id, true)} />
        : failure.retry && !['assistant_quota', 'assistant_rate_limited', 'assistant_history_full',
          'assistant_conversation_full'].includes(errorCode ?? '')
          && <TextButton label={t('common.retry')} onPress={failure.retry} />}
    </View>
  );
  const lastAssistant = messages.at(-1);

  return (
    <ScreenContainer>
      <AppHeader compact title={t(showHistory ? 'assistant.history' : 'assistant.title')}
        onBack={() => {
          if (!showHistory) backOrReplace(appRoutes.home);
          else if (!busy) { setShowHistory(false); setFailure(undefined); }
        }}
        action={showHistory
          ? <IconButton icon={MessageCirclePlus} accessibilityLabel={t('assistant.newChat')} disabled={Boolean(busy)} onPress={newChat} />
          : <IconButton icon={History} accessibilityLabel={t('assistant.history')} disabled={Boolean(busy)} onPress={() => loadHistory()} />} />
      {showHistory ? (
        <ScrollContainer contentContainerStyle={styles.history}>
          {historyBusy && <Text accessibilityLiveRegion="polite" style={styles.muted}>{t('assistant.connecting')}</Text>}
          {errorBlock}
          {!historyBusy && !failure && history.length === 0 && <Text style={styles.muted}>{t('assistant.noHistory')}</Text>}
          {history.map((item) => (
            <AppCard key={item.id} onPress={busy ? undefined : () => replaceChat(item.id)} accessibilityLabel={item.title}>
              <Text style={styles.heading} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.muted}>{new Date(item.updated_at).toLocaleDateString(i18n.language)}</Text>
            </AppCard>
          ))}
          {nextPage && <TextButton disabled={Boolean(busy)} label={t('integration.loadMore')} onPress={() => loadHistory(nextPage)} />}
        </ScrollContainer>
      ) : (
        <KeyboardAvoidingView style={styles.chat} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            contentContainerStyle={[styles.thread, { paddingHorizontal: screenMargin }]}
            maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
            onContentSizeChange={() => {
              if (scrollToLatest.current) {
                scrollToLatest.current = false;
                scroll.current?.scrollToEnd({ animated: true });
              }
            }}>
            {messages.length === 0 && !pendingMessage && (
              <Entrance style={styles.welcome}>
                <View style={styles.welcomeIcon}><Sparkles color={colors.surface} size={sizes.icon.lg} /></View>
                <Text accessibilityRole="header" style={styles.welcomeTitle}>{t('assistant.welcome')}</Text>
                <Text style={styles.muted}>{t('assistant.intro')}</Text>
                <View style={styles.suggestions}>
                  {suggestions.map((question) => (
                    <OutlineButton key={question} compact label={t(question)} icon={Sparkles}
                      disabled={Boolean(busy)} onPress={() => { setDraft(t(question)); setFailure(undefined); }} />
                  ))}
                </View>
              </Entrance>
            )}
            {older != null && conversation && <TextButton label={t('assistant.older')} disabled={Boolean(busy)}
              onPress={() => loadOlder(conversation, older)} />}
            {messages.map((message) => (
              <ChatBubble key={message.id} content={message.content} user={message.role === 'user'}
                time={new Date(message.created_at).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' })} />
            ))}
            {pendingMessage && <ChatBubble content={pendingMessage} user />}
            {generating && (
              <View style={styles.typing}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text accessibilityLiveRegion="polite" style={styles.muted}>{t('assistant.typing')}</Text>
              </View>
            )}
            {busy === 'open' && <Text accessibilityLiveRegion="polite" style={styles.muted}>{t('assistant.connecting')}</Text>}
          </ScrollView>
          <View style={[styles.footer, { paddingHorizontal: screenMargin }]}>
            {errorBlock}
            {conversation && <View style={styles.chatActions}>
              {lastAssistant?.role === 'assistant' && <TextButton icon={RotateCcw} compact disabled={Boolean(busy)}
                label={t('assistant.regenerate')} onPress={() => generate(
                  attempt?.kind === 'regenerate' ? attempt : { id: randomUUID(), kind: 'regenerate' },
                )} />}
              <TextButton icon={Trash2} compact disabled={Boolean(busy)}
                label={t('assistant.clear')} onPress={() => clear(conversation)} />
            </View>}
            <View style={styles.composer}>
              <TextInput accessibilityLabel={t('assistant.placeholder')} placeholder={t('assistant.placeholder')}
                placeholderTextColor={colors.muted} value={draft} editable={!busy} multiline maxLength={maxQuestionLength}
                style={styles.input} onChangeText={(value) => {
                  setDraft(value);
                  setAttempt(undefined);
                  setFailure(undefined);
                }} />
              <IconButton icon={ArrowUp} accessibilityLabel={t('assistant.send')} onPress={send}
                loading={busy === 'send'} disabled={Boolean(busy) || !draft.trim()} style={styles.send} />
            </View>
            <Text style={styles.notice}>{t('assistant.notice')}</Text>
          </View>
        </KeyboardAvoidingView>
      )}
    </ScreenContainer>
  );
}

function ChatBubble({ content, user, time }: { content: string; user: boolean; time?: string }) {
  return (
    <Entrance style={[styles.bubble, user ? styles.userBubble : styles.assistantBubble]}>
      <Text selectable style={[styles.bubbleText, user && styles.userText]}>{content}</Text>
      {time && <Text style={[styles.time, user && styles.userTime]}>{time}</Text>}
    </Entrance>
  );
}

const styles = StyleSheet.create({
  chat: { flex: 1 },
  thread: { flexGrow: 1, gap: spacing.md, paddingVertical: spacing.md },
  history: { gap: spacing.sm },
  welcome: {
    padding: spacing.lg, backgroundColor: colors.mint, borderRadius: radius.xxl, gap: spacing.sm,
  },
  welcomeIcon: {
    width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.lg, backgroundColor: colors.deep,
  },
  welcomeTitle: { ...typography.heading, color: colors.deep },
  suggestions: { gap: spacing.xs, marginTop: spacing.sm },
  heading: { ...typography.label, color: colors.ink },
  muted: { ...typography.supporting, color: colors.muted },
  bubble: { maxWidth: '92%', padding: spacing.md, borderRadius: radius.lg, gap: spacing.xxs },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.deep, borderBottomRightRadius: radius.sm },
  assistantBubble: {
    alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1, borderBottomLeftRadius: radius.sm,
  },
  bubbleText: { ...typography.body, color: colors.ink },
  userText: { color: colors.surface },
  time: { ...typography.metadata, color: colors.muted },
  userTime: { color: colors.onHero },
  typing: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: spacing.xs, backgroundColor: colors.mint, borderRadius: radius.full, padding: spacing.sm,
  },
  footer: { gap: spacing.xs, paddingVertical: spacing.xs, backgroundColor: colors.canvas },
  chatActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, backgroundColor: colors.surface,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.outline, padding: spacing.xxs,
  },
  input: {
    ...typography.body, color: colors.ink, minWidth: 0, flex: 1, minHeight: sizes.touchTarget,
    maxHeight: 120, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlignVertical: 'center',
  },
  send: { backgroundColor: colors.mint, borderRadius: radius.lg },
  notice: { ...typography.metadata, color: colors.muted },
  errorCard: { backgroundColor: colors.errorTint, padding: spacing.sm, borderRadius: radius.md },
  error: { ...typography.supporting, color: colors.error },
});
