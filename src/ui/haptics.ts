import * as Haptics from 'expo-haptics';

// Touch feedback that never throws: some phones and browsers have no vibration.
const quiet = (promise: Promise<void>) => promise.catch(() => undefined);

export const haptic = {
  select: () => quiet(Haptics.selectionAsync()),
  press: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
