type HomeComposerDropOverlayProps = {
  title: string;
  hint: string;
};

export function HomeComposerDropOverlay({
  title,
  hint,
}: HomeComposerDropOverlayProps) {
  return (
    <div className="app-home-composer-drop-overlay" aria-hidden="true">
      <div className="app-home-composer-drop-card">
        <p className="app-home-composer-drop-title">{title}</p>
        <p className="app-home-composer-drop-hint">{hint}</p>
      </div>
    </div>
  );
}
