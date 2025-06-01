// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleDissect');
    const statusDiv = document.getElementById('status');

    toggleButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab.url && activeTab.url.includes("youtube.com/watch")) {
                // Send message to content script to toggle the UI
                chrome.tabs.sendMessage(activeTab.id, { action: "toggleUI" }, (response) => {
                    if (chrome.runtime.lastError) {
                        statusDiv.textContent = "Error: " + (chrome.runtime.lastError.message || "Unknown error");
                        console.error(chrome.runtime.lastError);
                    } else if (response && response.status === "active") {
                        statusDiv.textContent = "Dissect Mode Active!";
                        toggleButton.textContent = "Deactivate Dissect Mode";
                        toggleButton.style.backgroundColor = "#555";
                    } else if (response && response.status === "inactive") {
                        statusDiv.textContent = "Dissect Mode Inactive.";
                        toggleButton.textContent = "Activate Dissect Mode";
                        toggleButton.style.backgroundColor = "#FF0000";
                    } else {
                        statusDiv.textContent = "Processing...";
                    }
                });
            } else {
                statusDiv.textContent = "Please navigate to a YouTube video page.";
            }
        });
    });

    // Request initial status when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab.url && activeTab.url.includes("youtube.com/watch")) {
            chrome.tabs.sendMessage(activeTab.id, { action: "getStatus" }, (response) => {
                 if (response && response.status === "active") {
                    statusDiv.textContent = "Dissect Mode Active!";
                    toggleButton.textContent = "Deactivate Dissect Mode";
                    toggleButton.style.backgroundColor = "#555";
                } else {
                    statusDiv.textContent = "Dissect Mode Inactive.";
                    toggleButton.textContent = "Activate Dissect Mode";
                    toggleButton.style.backgroundColor = "#FF0000";
                }
            });
        } else {
            statusDiv.textContent = "Please navigate to a YouTube video page.";
            toggleButton.disabled = true;
        }
    });
});