
export default function Popup() {
  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="w-64 p-4 bg-background">
      <h1 className="text-xl font-bold mb-2">🦸 BookmarkHero</h1>
      <div className="flex flex-col gap-2 mt-4">
        <button 
          onClick={openOptions}
          className="bg-primary text-primary-foreground py-2 px-4 rounded hover:bg-primary/90 transition-colors"
        >
          ⚙️ Open Dashboard
        </button>
      </div>
    </div>
  );
}
