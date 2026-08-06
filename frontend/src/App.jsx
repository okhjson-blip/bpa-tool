import previewHtml from '../../ui mokup/BPA_Tool_UI_Preview.html?raw';

/**
 * The approved BPA mock-up is the visual contract for the application.
 * Rendering it as an isolated document prevents Vite/Tailwind defaults from
 * changing its carefully tuned 14-inch desktop layout or its inline flows.
 */
export default function App() {
  return (
    <iframe
      className="bpa-preview"
      srcDoc={previewHtml}
      title="BPA Tool"
      sandbox="allow-forms allow-modals allow-scripts allow-same-origin allow-downloads"
    />
  );
}
