import { defineContentScript } from 'wxt/sandbox';
import { browser } from 'wxt/browser';

export default defineContentScript({
  matches: ['https://example.com/*'],
  main(ctx) {
    // Set up the listener to receive messages from your popup/background
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      
      // Check what kind of message was sent
      if (message.action === "LOAD_INBOX") {
        console.log("Inbox load requested!");
        
        // Do your logic here...
        
        // Send a response back to the UI so it knows it succeeded
        sendResponse({ status: "success", data: "Inbox loaded" });
      }

      // Important: Return true if you plan to send the response asynchronously
      // return true; 
    });
  },
});
