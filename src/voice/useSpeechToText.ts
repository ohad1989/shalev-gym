import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

// Words the recognizer should expect, so "reps" isn't heard as "wraps".
const GYM_WORDS = [
  'reps', 'sets', 'kg', 'kilos', 'pounds', 'superset', 'drop set', 'pyramid', 'to failure',
  'bodyweight', 'bench press', 'incline press', 'squat', 'deadlift', 'Romanian deadlift',
  'overhead press', 'lat pulldown', 'cable pushdown', 'cable fly', 'pull-ups', 'chin-ups', 'dips',
  'curls', 'hammer curls', 'lateral raises', 'leg press', 'leg extension', 'leg curl',
  'hip thrust', 'lunges', 'barbell row', 'dumbbell', 'end workout',
];

const MESSAGES: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  'no-speech': "I didn't hear anything. Tap Record and say the exercise.",
  'speech-timeout': "I didn't hear anything. Tap Record and say the exercise.",
  'not-allowed':
    'Shalev Gym needs the microphone. Allow it in your phone settings, or type the exercise instead.',
  'service-not-allowed':
    'Speech recognition is turned off on this phone. Type the exercise instead.',
  network: 'Speech recognition needs an internet connection right now. Type the exercise instead.',
  'language-not-supported':
    'English speech recognition is not installed on this phone. Type the exercise instead.',
  'audio-capture': 'The microphone could not be used. Close other apps using it and try again.',
  busy: 'Speech recognition is busy. Wait a moment and try again.',
};

// Speech to text on the device (free edition): Android's built-in recognizer, or the browser's on web.
// onHeard receives the final text and the moment the user tapped Record, which is when the set ended.
export function useSpeechToText(onHeard: (text: string, tappedAt: Date) => void) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tappedAt = useRef<Date | null>(null);
  const heard = useRef('');
  const lastPartial = useRef('');
  const onHeardRef = useRef(onHeard);

  useEffect(() => {
    onHeardRef.current = onHeard;
  }, [onHeard]);

  useSpeechRecognitionEvent('start', () => setListening(true));

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    setPartial(text);
    lastPartial.current = text.trim();
    if (event.isFinal && text.trim()) heard.current = text.trim();
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted') return;
    setError(MESSAGES[event.error] ?? 'Speech recognition stopped. Try again, or type the exercise.');
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    setPartial('');
    // Some recognizers end without a final result when stopped early: use what was heard.
    const text = heard.current || lastPartial.current;
    heard.current = '';
    lastPartial.current = '';
    const at = tappedAt.current ?? new Date();
    tappedAt.current = null;
    if (text) onHeardRef.current(text, at);
  });

  const start = useCallback(async () => {
    setError(null);
    setPartial('');
    heard.current = '';
    lastPartial.current = '';
    const at = new Date();
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError('Speech recognition is not available on this device. Type the exercise instead.');
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError(MESSAGES['not-allowed']!);
        return;
      }
      tappedAt.current = at;
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        contextualStrings: GYM_WORDS,
        // Leave room to pause between numbers: "eighty kilos... ten, ten, eight".
        androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500 },
      });
    } catch {
      tappedAt.current = null;
      setListening(false);
      setError('Speech recognition could not start. Type the exercise instead.');
    }
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { listening, partial, error, start, stop };
}
