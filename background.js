// background.js

chrome.action.onClicked.addListener((tab) => {
    // Only inject if it's a YouTube video page
    if (tab.url && tab.url.includes("youtube.com/watch")) {
        // We'll send a message to the content script to toggle the UI.
        // First, check if the content script is already injected and ready.
        // We do this by trying to send a message. If it fails, the script
        // likely isn't fully set up yet, so we inject it.

        chrome.tabs.sendMessage(tab.id, { action: "toggleUI" }, (response) => {
            if (chrome.runtime.lastError || !response || !response.status) {
                // Content script not ready or not injected yet. Inject it.
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content.js"]
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Failed to inject content script:", chrome.runtime.lastError.message);
                    } else {
                        console.log("Content script injected.");
                        // After injection, send the toggleUI message again
                        chrome.tabs.sendMessage(tab.id, { action: "toggleUI" });
                    }
                });
                chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ["content.css"]
                });
            } else {
                console.log("Content script already active, toggling UI.");
            }
        });
    } else {
        // Optional: Open popup or show a message if not on a YouTube video page
        console.log("Not a YouTube video page. Extension works only on YouTube video pages.");
        // You could open a small popup here to inform the user
        chrome.action.setPopup({ popup: "not_youtube_popup.html" }); // You'd need to create this HTML
        setTimeout(() => chrome.action.setPopup({ popup: "popup.html" }), 3000); // Reset after 3 seconds
    }
});