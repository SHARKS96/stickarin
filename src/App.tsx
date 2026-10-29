/**
 * Die Wege durch die App.
 *
 * Fünf Schritte in einer Reihe, dazu zwei Abzweige, die nur auf Wunsch
 * erscheinen: „Farbe anpassen“ und „Erweiterte Einstellungen“. Jeder
 * Schirm hat dieselbe Kopfleiste mit Zurück, Fortschritt und Hilfe.
 */
import { useState } from 'react';
import { HelpDialog, TopBar } from './ui/Shell.tsx';
import { useDesign } from './state/useDesign.ts';
import { START_HELP, StartScreen } from './ui/screens/StartScreen.tsx';
import { IMAGE_HELP, ImageScreen } from './ui/screens/ImageScreen.tsx';
import { SIZE_HELP, SizeScreen } from './ui/screens/SizeScreen.tsx';
import { COLORS_HELP, ColorsScreen } from './ui/screens/ColorsScreen.tsx';
import { ADJUST_HELP, ColorAdjustScreen } from './ui/screens/ColorAdjustScreen.tsx';
import { PREVIEW_HELP, PreviewScreen } from './ui/screens/PreviewScreen.tsx';
import { ADVANCED_HELP, AdvancedScreen } from './ui/screens/AdvancedScreen.tsx';
import { SAVE_HELP, SaveScreen } from './ui/screens/SaveScreen.tsx';

type Screen = 'start' | 'image' | 'size' | 'colors' | 'adjust' | 'preview' | 'advanced' | 'save';

/** Welcher der fünf Schritte in der Kopfleiste leuchtet; null = Startseite. */
const STEP_OF: Record<Screen, number | null> = {
  start: null,
  image: 0,
  size: 1,
  colors: 2,
  adjust: 2,
  preview: 3,
  advanced: 3,
  save: 4,
};

const HELP: Record<Screen, { title: string; steps: React.ReactNode[] }> = {
  start: { title: 'So funktioniert die App', steps: START_HELP },
  image: { title: 'Hilfe: Bild auswählen', steps: IMAGE_HELP },
  size: { title: 'Hilfe: Größe einstellen', steps: SIZE_HELP },
  colors: { title: 'Hilfe: Farben', steps: COLORS_HELP },
  adjust: { title: 'Hilfe: Farbe anpassen', steps: ADJUST_HELP },
  preview: { title: 'Hilfe: Vorschau', steps: PREVIEW_HELP },
  advanced: { title: 'Hilfe: Erweiterte Einstellungen', steps: ADVANCED_HELP },
  save: { title: 'Hilfe: Speichern', steps: SAVE_HELP },
};

/** Wohin „Zurück“ führt. Auf der Startseite gibt es keinen Weg zurück. */
const BACK_TO: Record<Screen, Screen | null> = {
  start: null,
  image: 'start',
  size: 'image',
  colors: 'size',
  adjust: 'colors',
  preview: 'colors',
  advanced: 'preview',
  save: 'preview',
};

export function App() {
  const design = useDesign();
  const [screen, setScreen] = useState<Screen>('start');
  const [adjusting, setAdjusting] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  const back = BACK_TO[screen];
  const help = HELP[screen];

  return (
    <div className="app">
      <TopBar
        step={STEP_OF[screen]}
        onBack={back ? () => setScreen(back) : undefined}
        onHelp={() => setHelpOpen(true)}
      />

      {screen === 'start' && (
        <StartScreen
          gallery={design.gallery}
          onNew={() => {
            design.setSource(null);
            setScreen('image');
          }}
          onOpen={(id) => {
            void design.open(id).then((ok) => ok && setScreen('size'));
          }}
          onForget={(id) => void design.forget(id)}
        />
      )}

      {screen === 'image' && (
        <ImageScreen
          onSource={(loaded) => {
            design.setSource(loaded);
            design.setDesignName(loaded.name || 'Stickbild');
            setScreen('size');
          }}
        />
      )}

      {screen === 'size' && <SizeScreen design={design} onNext={() => setScreen('colors')} />}

      {screen === 'colors' && (
        <ColorsScreen
          design={design}
          onAdjust={(index) => {
            setAdjusting(index);
            setScreen('adjust');
          }}
          onNext={() => setScreen('preview')}
        />
      )}

      {screen === 'adjust' && (
        <ColorAdjustScreen
          design={design}
          colorIndex={adjusting}
          onDone={() => setScreen('colors')}
          onCancel={() => setScreen('colors')}
        />
      )}

      {screen === 'preview' && (
        <PreviewScreen
          design={design}
          onAdvanced={() => setScreen('advanced')}
          onNext={() => setScreen('save')}
        />
      )}

      {screen === 'advanced' && (
        <AdvancedScreen design={design} onDone={() => setScreen('preview')} />
      )}

      {screen === 'save' && <SaveScreen design={design} onFinish={() => setScreen('start')} />}

      <HelpDialog
        open={helpOpen}
        title={help.title}
        steps={help.steps}
        onClose={() => setHelpOpen(false)}
      />

      {design.error && (
        <p className="notice" data-kind="error" role="alert" style={{ margin: '0 32px 24px' }}>
          {design.error}
        </p>
      )}
    </div>
  );
}
