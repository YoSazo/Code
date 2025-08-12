<script>

(function() {
    // This script is designed to track a successful purchase on a webpage, specifically a confirmation page.
    // It extracts key information like a reservation ID and the total amount, then sends this data to Zapier and Facebook Pixel.

    // --- Helper functions ---

    /**
     * Retrieves the value of a cookie by its name.
     * @param {string} name - The name of the cookie to retrieve.
     * @returns {string|null} - The cookie's value or null if not found.
     */
    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        console.log(`[getCookie] Could not find cookie with name: ${name}`);
        return null;
    }

    /**
     * Scans the page for a reservation ID, typically a Cloudbeds reservation number.
     * It looks for a specific text pattern "reservation number is #" within paragraph elements.
     * @returns {string|null} - The extracted reservation ID or null if not found.
     */
    function getReservationIdFromPageText() {
        console.log('[getReservationIdFromPageText] Attempting to extract reservation ID from page text...');
        let reservationId = null;
        const potentialReservationElements = document.querySelectorAll('p[data-be-text="true"]');
        if (potentialReservationElements.length > 0) {
            console.log(`[getReservationIdFromPageText] Found ${potentialReservationElements.length} potential elements.`);
            for (let i = 0; i < potentialReservationElements.length; i++) {
                const elementText = potentialReservationElements[i].textContent;
                if (elementText && elementText.includes("reservation number is #")) {
                    console.log(`[getReservationIdFromPageText] Found text containing "reservation number is #".`);
                    const match = elementText.match(/#([A-Z0-9-]+)/i);
                    if (match && match[1]) {
                        reservationId = match[1].trim();
                        console.log("[getReservationIdFromPageText] Successfully extracted Reservation ID:", reservationId);
                        break;
                    }
                }
            }
        }
        if (!reservationId) {
            console.warn('[getReservationIdFromPageText] Could not find a valid Cloudbeds Reservation ID on the page.');
        }
        return reservationId;
    }

    /**
     * Extracts the total amount from a specific element on the page.
     * It looks for a paragraph element with the data-testid 'shopping-cart-summary-grand-total'.
     * The script then extracts the first number it finds, which represents the full price.
     * @returns {number|null} - The extracted value as a number, or null if the element or value is not found.
     */
    function getTotalAmount() {
        console.log('[getTotalAmount] Attempting to extract the total amount...');
        const amountElement = document.querySelector('p[data-testid="shopping-cart-summary-grand-total"]');
        console.log('[getTotalAmount] Found amount element:', amountElement, 'Text:', amountElement ? amountElement.textContent : 'Not found');
        if (amountElement) {
            // This regex will find the first number with two decimal places.
            const amountText = amountElement.textContent.match(/\d+\.\d{2}/);
            if (amountText && amountText[0]) {
                const value = parseFloat(amountText[0]);
                console.log(`[getTotalAmount] Extracted full amount: ${value}`);
                return value;
            }
        }
        console.warn('[getTotalAmount] Could not extract a valid amount from the designated element.');
        return null;
    }

    /**
     * The core logic for tracking. This function gathers all necessary data,
     * builds the payloads for Zapier and Facebook Pixel, and sends them.
     * @returns {boolean} - True if the tracking logic was executed (even if data was missing), false otherwise.
     */
    function executeTrackingLogic() {
        console.log('[executeTrackingLogic] Starting tracking logic...');

        const reservationId = getReservationIdFromPageText();
        if (!reservationId) {
            console.warn('[executeTrackingLogic] Aborting tracking logic because no reservation ID was found.');
            return false;
        }

        const value = getTotalAmount();
        if (!value) {
            console.warn('[executeTrackingLogic] Aborting tracking logic because no total amount was found.');
            return false;
        }

        // Gather data from cookies and browser
        const fbc = getCookie('_fbc');
        const fbp = getCookie('_fbp');
        const clientUserAgent = navigator.userAgent;
        const eventSourceUrl = window.location.href;

        // --- Zapier Webhook Payload ---
        console.log('[executeTrackingLogic] Preparing Zapier webhook payload...');
        const zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/23096608/uuwt2j6/';
        const zapierPayload = {
            cloudbeds_reservation_id: reservationId,
            fbc,
            fbp,
            client_user_agent: clientUserAgent,
            client_event_source_url: eventSourceUrl,
            value,
            currency: 'USD'
        };
        console.log('[executeTrackingLogic] Zapier Payload:', zapierPayload);

        // Send data to Zapier
        console.log('[executeTrackingLogic] Sending data to Zapier...');
        fetch(zapierWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(zapierPayload),
                mode: 'no-cors'
            })
            .then(() => console.log('[executeTrackingLogic] Zapier data sent successfully.'))
            .catch(error => console.error('[executeTrackingLogic] Error sending data to Zapier:', error));

        // --- Facebook Pixel Tracking ---
        if (typeof fbq === 'function' && !window.__purchaseEventFired) {
            console.log('[executeTrackingLogic] Facebook Pixel (fbq) is available and the purchase event has not been fired yet.');
            const pixelData = {
                event_id: reservationId,
                event_source_url: eventSourceUrl,
                value,
                currency: 'USD'
            };
            console.log('[executeTrackingLogic] fbq Pixel Data to be sent:', pixelData);
            fbq('track', 'Purchase', pixelData);
            console.log(`[executeTrackingLogic] fbq('track', 'Purchase') called with value: ${pixelData.value}`);
            window.__purchaseEventFired = true; // Set a flag to prevent this from firing multiple times.
        } else if (window.__purchaseEventFired) {
            console.log('[executeTrackingLogic] Purchase event has already been fired for this session, skipping.');
        } else {
            console.warn('[executeTrackingLogic] fbq function is not available on this page. Skipping Facebook Pixel tracking.');
        }

        return true;
    }

    /**
     * Checks if the current page is a confirmation page. If it is, it starts a check interval
     * to run the tracking logic. If not, it clears the interval.
     */
    function checkConfirmationPage() {
        const currentUrl = window.location.href;
        console.log(`[checkConfirmationPage] Current URL is: ${currentUrl}`);

        if (currentUrl.includes('/confirmation')) {
            console.log('[checkConfirmationPage] URL indicates a confirmation page. Starting checks for tracking data.');
            if (!window.__purchaseEventCheckInterval) {
                console.log('[checkConfirmationPage] No existing check interval found. Creating a new one.');
                window.__purchaseEventCheckInterval = setInterval(() => {
                    console.log('[checkConfirmationPage] Interval check triggered...');
                    if (executeTrackingLogic()) {
                        clearInterval(window.__purchaseEventCheckInterval);
                        window.__purchaseEventCheckInterval = null;
                        console.log('[checkConfirmationPage] Tracking logic executed successfully. Check interval cleared.');
                    }
                }, 200); // Check every 200ms to allow for dynamic content to load
            }
        } else {
            console.log('[checkConfirmationPage] Not on a confirmation page. Clearing any existing check intervals and reset flags.');
            if (window.__purchaseEventCheckInterval) {
                clearInterval(window.__purchaseEventCheckInterval);
                window.__purchaseEventCheckInterval = null;
                // Reset the flag so if the user navigates back to the confirmation page, it will fire again.
                delete window.__purchaseEventFired;
            }
        }
    }

    // --- Event Listeners and Initial Call ---
    // Listen for DOMContentLoaded to run an initial check when the page first loads.
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[DOMContentLoaded] Page has loaded, running initial check.');
        checkConfirmationPage();
    });

    // Listen for back/forward browser button clicks.
    window.addEventListener('popstate', () => {
        console.log('[popstate] Browser history changed (back/forward button). Re-checking page.');
        checkConfirmationPage();
    });

    // Intercept pushState and replaceState to handle dynamic content loading (e.g., Single Page Applications).
    // This ensures the script runs even if the URL changes without a full page reload.
    const originalPushState = history.pushState;
    history.pushState = function() {
        console.log('[pushState] URL changed via pushState. Applying original function and re-checking.');
        originalPushState.apply(this, arguments);
        setTimeout(checkConfirmationPage, 50);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        console.log('[replaceState] URL changed via replaceState. Applying original function and re-checking.');
        originalReplaceState.apply(this, arguments);
        setTimeout(checkConfirmationPage, 50);
    };

    // Run a final check on script load, just in case DOMContentLoaded was already fired.
    console.log('[Script Initializing] Running initial page check.');
    checkConfirmationPage();
})();

(function(){
  // — Replace these with your actual Zapier webhook URLs —
  const ZAPIER_URLS = {
    Search:    'https://hooks.zapier.com/hooks/catch/23096608/uu9wu4u/',
    AddToCart: 'https://hooks.zapier.com/hooks/catch/23096608/uu9whix/'
  };

  // — Helper to read Facebook cookies —
  function getCookie(name) {
    const nameEQ = name + "=";
    return document.cookie
      .split(';')
      .map(s=>s.trim())
      .filter(c=>c.indexOf(nameEQ)===0)
      .map(c=>c.substring(nameEQ.length))[0] || null;
  }

  // — Get price value with persistent polling and single fire
  function getPriceValue() {
    return new Promise(resolve => {
      let attempts = 0;
      const checkPrice = () => {
        const priceElement = document.querySelector('p[data-testid="shopping-cart-banner-grand-total"]');
        console.log(`Attempt ${attempts + 1}: Price Element:`, priceElement, 'Text:', priceElement ? priceElement.textContent.trim() : 'Not found');
        if (priceElement) {
          const match = priceElement.textContent.trim().match(/\d+\.\d{2}/);
          if (match && match[0]) {
            const value = parseFloat(match[0]);
            if (value > 0) {
              console.log('Extracted Price Value:', value);
              resolve(value);
              return; // Stop polling after resolving
            }
          }
        }
        attempts++;
        setTimeout(checkPrice, 200); // Continue polling every 200ms
      };
      // Initial delay to sync with page update
      setTimeout(checkPrice, 500);
    });
  }

  // — Unified sender: Pixel + CAPI —
  function sendEvent(eventName, eventProps = {}) {
    const event_id = 'evt_' + Date.now();
    const fbc      = getCookie('_fbc');
    const fbp      = getCookie('_fbp');
    const url      = window.location.href;
    const ua       = navigator.userAgent;

    // 1) Browser Pixel
    if (typeof fbq === 'function') {
      fbq('trackCustom', eventName, {
        event_id,
        event_source_url: url,
        fbc, fbp,
        ...eventProps
      });
      console.log(`✅ ${eventName} pixel fired`, {event_id, fbc, fbp, ua, url, ...eventProps});
    }

    // 2) Server CAPI via Zapier
    fetch(ZAPIER_URLS[eventName], {
      method:  'POST',
      mode:    'no-cors',
      headers: {'Content-Type':'application/json'},
      body:    JSON.stringify({
        event_name: eventName,
        event_id, fbc, fbp, ua, url,
        ...eventProps
      })
    }).catch(e=>console.warn(`⚠️ ${eventName} CAPI error`, e));
  }

  // — Fire-once guards —
  const fired = { Search: false, AddToCart: false };

  // — 1) Search: on URL containing both checkin & checkout params —
  function checkSearchStep() {
    if (fired.Search) return;
    const params = new URLSearchParams(location.search);
    if (params.has('checkin') && params.has('checkout')) {
      fired.Search = true;
      sendEvent('Search');
    }
  }

  // — 2) AddToCart: on click of “Add” button with price —
  async function initAddToCartListener() {
    document.body.addEventListener('click', async e => {
      if (fired.AddToCart) return; // Prevent multiple triggers
      const btn = e.target.closest('button');
      if (btn && btn.innerText.trim().toLowerCase().includes('add')) {
        const value = await getPriceValue(); // Wait for price
        if (value || value === 0) { // Proceed with any resolved value
          fired.AddToCart = true; // Set flag immediately to prevent re-trigger
          sendEvent('AddToCart', { value, currency: 'USD' }); // Include value and currency
        }
      }
    }, { once: true }); // Ensure the listener only triggers once per page load
  }

  // — Boot up on initial load & SPA navigations —
  function init() {
    checkSearchStep();
    initAddToCartListener();
  }
  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('popstate', init);
  (function(history){
    const push = history.pushState;
    history.pushState = function(){
      push.apply(this, arguments);
      setTimeout(init, 50); // Reinitialize on navigation
    };
  })(window.history);
})();






(function() {
    // --- Zapier Webhook URLs ---
    // IMPORTANT: Ensure these are correct and match your Zapier configurations.
    const ZAPIER_WEBHOOK_ADD_PAYMENT_INFO = 'https://hooks.zapier.com/hooks/catch/20820987/u364xq8/'; // Your existing CAPI for AddPaymentInfo
    const ZAPIER_WEBHOOK_CUSTOM_EVENTS = 'https://hooks.zapier.com/hooks/catch/23096608/uu02yfo/'; // Your new CAPI for PaymentSubmitClick and PaymentError

    // --- Helpers ---

    /**
     * Retrieves the value of a specific cookie by name.
     * @param {string} name The name of the cookie to retrieve.
     * @returns {string|null} The cookie's value or null if not found.
     */
    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let c of ca.map(s => s.trim())) {
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
        }
        return null;
    }

    /**
     * Polls the DOM to extract the payment grand total value.
     * Uses a Promise to resolve once a valid value is found.
     * @returns {Promise<number>} A promise that resolves with the parsed payment value.
     */
    function getPaymentValue() {
        return new Promise(resolve => {
            let attempts = 0;
            const checkPrice = () => {
                const paymentElement = document.querySelector('p[data-testid="shopping-cart-summary-grand-total"]');
                // console.log(`Attempt ${attempts + 1}: Payment Element:`, paymentElement, 'Text:', paymentElement ? paymentElement.textContent.trim() : 'Not found'); // Uncomment for verbose debugging
                if (paymentElement) {
                    const match = paymentElement.textContent.trim().match(/\d+\.\d{2}/); // Matches X.XX format
                    if (match && match[0]) {
                        const value = parseFloat(match[0]);
                        if (!isNaN(value) && value > 0) {
                            console.log('Extracted Payment Value:', value);
                            resolve(value);
                            return; // Stop polling after resolving
                        }
                    }
                }
                attempts++;
                // Continue polling every 200ms
                setTimeout(checkPrice, 200);
            };
            // Initial delay to sync with page updates after navigation
            setTimeout(checkPrice, 500);
        });
    }

    /**
     * Sends a CAPI event to the specified Zapier webhook.
     * Includes common user data and event-specific properties.
     * @param {string} eventName The name of the event (e.g., 'PaymentSubmitClick').
     * @param {string} webhookUrl The specific Zapier webhook URL for this event.
     * @param {object} eventData Optional additional data specific to the event.
     */
    function sendCAPIEvent(eventName, webhookUrl, eventData = {}) {
        const event_id = 'evt_' + Date.now(); // Unique event ID for deduplication
        const fbc = getCookie('_fbc'); // Facebook Click ID cookie
        const fbp = getCookie('_fbp'); // Facebook Browser ID cookie
        const ua = navigator.userAgent; // User Agent string
        const url = window.location.href; // Current page URL

        const payload = {
            event_name: eventName,
            event_id,
            fbc,
            fbp,
            ua,
            url,
            ...eventData // Merge in any specific event data (like value/currency)
        };

        console.log(`[Debug] Attempting Zapier fetch for ${eventName} to ${webhookUrl}...`, payload);
        fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors', // Use 'no-cors' for opaque response, common with Zapier webhooks
            body: JSON.stringify(payload)
        })
        .then(() => console.log(`✅ ${eventName} CAPI event sent successfully to ${webhookUrl}.`))
        .catch(err => console.warn(`⚠️ ${eventName} CAPI error to ${webhookUrl}:`, err));
    }

    // --- Event Tracking Functions ---

    /**
     * Fires the standard 'AddPaymentInfo' pixel and CAPI event once per session on the payment step.
     */
    function fireAddPaymentInfoOnce() {
        // Use a window flag to ensure it only fires once per session (browser navigation)
        if (window.__addPaymentInfoFired) {
            console.log('AddPaymentInfo already fired for this session, skipping.');
            return;
        }
        window.__addPaymentInfoFired = true;

        const url = window.location.href;

        getPaymentValue().then(value => {
            const currency = value ? 'USD' : undefined; // Assuming USD, adjust if necessary
            const eventData = {
                event_source_url: url,
                ...(value && { value, currency }) // Conditionally add value and currency if available
            };

            // 1) Facebook Pixel (Client-side)
            if (typeof fbq === 'function') {
                fbq('track', 'AddPaymentInfo', { ...eventData });
                console.log('✅ AddPaymentInfo pixel fired', eventData);
            } else {
                console.warn('⚠️ fbq function not available, AddPaymentInfo pixel not loaded');
            }

            // 2) CAPI via Zapier (Server-side)
            sendCAPIEvent('AddPaymentInfo', ZAPIER_WEBHOOK_ADD_PAYMENT_INFO, eventData);
        });
    }

    /**
     * Attaches a click listener to the "Book Now" button to track 'PaymentSubmitClick'.
     * Uses polling to ensure the button is available before attaching the listener.
     */
    function trackPaymentSubmitClick() {
        // Use a window flag to ensure the listener is initialized only once per relevant page load
        if (window.__paymentSubmitClickInitialized) {
            console.log('PaymentSubmitClick listener already initialized, skipping.');
            return;
        }
        window.__paymentSubmitClickInitialized = true;

        let attempts = 0;
        const maxAttempts = 20; // Try for up to 4 seconds (20 attempts * 200ms interval)

        const checkButton = () => {
            // Select the "Book Now" button using its data-testid attribute
            const bookNowButton = document.querySelector('button[data-testid="shopping-cart-banner-confirm-button"]');

            if (bookNowButton) {
                // Attach click listener, ensuring it only fires once for the element's lifetime
                bookNowButton.addEventListener('click', function() {
                    // Use another flag to prevent multiple event fires from rapid clicks
                    if (window.__paymentSubmitClickFired) {
                        console.log('PaymentSubmitClick already fired for this click action, skipping.');
                        return;
                    }
                    window.__paymentSubmitClickFired = true;

                    const url = window.location.href;
                    // Attempt to get payment value for this event as well
                    getPaymentValue().then(value => {
                        const currency = value ? 'USD' : undefined;
                        const eventData = {
                            event_source_url: url,
                            ...(value && { value, currency })
                        };

                        // 1) Facebook Pixel (Client-side)
                        if (typeof fbq === 'function') {
                            fbq('trackCustom', 'PaymentSubmitClick', { ...eventData });
                            console.log('✅ Facebook Pixel: PaymentSubmitClick tracked.', eventData);
                        } else {
                            console.warn('⚠️ fbq function not available, PaymentSubmitClick not tracked');
                        }

                        // 2) CAPI via Zapier (Server-side)
                        sendCAPIEvent('PaymentSubmitClick', ZAPIER_WEBHOOK_CUSTOM_EVENTS, eventData);
                    });
                }, { once: true }); // Automatically removes the listener after the first click
                console.log('Book Now button listener attached for PaymentSubmitClick.');
                return; // Stop polling once the listener is successfully attached
            }

            if (attempts < maxAttempts) {
                attempts++;
                setTimeout(checkButton, 200); // Continue polling
            } else {
                console.warn('⚠️ Book Now button not found after multiple attempts for PaymentSubmitClick.');
            }
        };
        setTimeout(checkButton, 500); // Initial delay to allow DOM to render
    }

    /**
     * Observes the DOM for the appearance of payment error messages and tracks 'PaymentError'.
     * Uses a MutationObserver for efficient and real-time detection.
     */
    function trackPaymentError() {
        // Use a window flag to ensure the observer is initialized only once per page load/navigation
        if (window.__paymentErrorObserverInitialized) {
            console.log('PaymentError observer already initialized, skipping.');
            return;
        }
        // DO NOT set window.__paymentErrorObserverInitialized = true; here yet.
        // We only set it true once the observer is successfully created AND observing.

        // --- IMPORTANT: CUSTOMIZE THIS SELECTOR ---
        const paymentErrorSelector = '.cb-error-message, [data-testid*="error"], .payment-error-alert'; // Placeholder: Refine this based on your testing!

        const observerConfig = { childList: true, subtree: true }; // Watch for added nodes anywhere in the DOM

        const callback = function(mutationsList, observer) {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        // Check if the added node itself is an error element or contains one
                        // Also, use a flag to prevent multiple fires for the same error display
                        if (node.nodeType === 1 && (node.matches(paymentErrorSelector) || node.querySelector(paymentErrorSelector)) && !window.__paymentErrorFired) {
                            window.__paymentErrorFired = true; // Set flag immediately to prevent re-triggering

                            const url = window.location.href;
                            getPaymentValue().then(value => { // Attempt to get payment value even on error
                                const currency = value ? 'USD' : undefined;
                                const eventData = {
                                    event_source_url: url,
                                    ...(value && { value, currency }),
                                    error_message_detected: true // Optional: Add a property to indicate detection method
                                };

                                // 1) Facebook Pixel (Client-side)
                                if (typeof fbq === 'function') {
                                    fbq('trackCustom', 'PaymentError', { ...eventData });
                                    console.log('✅ Facebook Pixel: PaymentError tracked.', eventData);
                                } else {
                                    console.warn('⚠️ fbq function not available, PaymentError not tracked');
                                }

                                // 2) CAPI via Zapier (Server-side)
                                sendCAPIEvent('PaymentError', ZAPIER_WEBHOOK_CUSTOM_EVENTS, eventData);
                            });

                            // Optionally, disconnect the observer after the first error is detected
                            // If you want to track subsequent errors on the same page without reload, keep observing.
                            // observer.disconnect();
                        }
                    });
                }
            }
        };

        // --- FIX FOR 'observe' ON 'MutationObserver' ERROR ---
        // Ensure document.body exists before attempting to observe it.
        // We'll add a small polling mechanism here, similar to getPaymentValue.
        let bodyCheckAttempts = 0;
        const maxBodyCheckAttempts = 20; // Try for up to 4 seconds (20 * 200ms)

        const tryObserveBody = () => {
            if (document.body) {
                const observer = new MutationObserver(callback);
                observer.observe(document.body, observerConfig);
                console.log('Payment Error observer started on document.body.');
                window.__paymentErrorObserverInitialized = true; // Set flag only after successful observation
            } else if (bodyCheckAttempts < maxBodyCheckAttempts) {
                bodyCheckAttempts++;
                console.log(`Attempt ${bodyCheckAttempts}: document.body not yet available for MutationObserver. Retrying...`);
                setTimeout(tryObserveBody, 200);
            } else {
                console.warn('⚠️ Could not initialize Payment Error observer: document.body not found after multiple attempts.');
            }
        };

        setTimeout(tryObserveBody, 100); // Initial small delay to let body render
    }

    // --- Main Control Flow ---

    /**
     * Central function to check the current URL and trigger relevant tracking.
     * Designed to be called on initial load and during SPA-style navigation.
     */
    function checkForTrackingEvents() {
        const currentPath = window.location.pathname;
        const currentHref = window.location.href;

        // Reset flags related to specific page views/actions that should re-fire on new relevant pages
        // or for each action taken on a given page if intended.
        // For PaymentSubmitClick and AddPaymentInfo, we typically want them once per 'payment step'.
        // For PaymentError, the observer is generally 'always on' once initialized.
        window.__paymentSubmitClickFired = false; // Reset for potential re-clicks/new page loads
        window.__paymentErrorFired = false;     // Reset for new error occurrences

        // Trigger AddPaymentInfo and PaymentSubmitClick listener setup on the payment step
        if (currentPath.includes('/reservation/') && currentHref.includes('/payment')) {
            fireAddPaymentInfoOnce(); // This function contains its own __addPaymentInfoFired flag
            trackPaymentSubmitClick(); // This function contains its own __paymentSubmitClickInitialized flag
        }

        // Always start the PaymentError observer, as errors can occur on any step
        // or appear dynamically after initial page load.
        // This function handles its own initialization flag and ensures document.body is ready.
        trackPaymentError();
    }

    // --- Event Listeners for Page Load and Navigation ---

    // 1. Initial page load
    document.addEventListener('DOMContentLoaded', checkForTrackingEvents);

    // 2. Browser history navigation (back/forward buttons)
    window.addEventListener('popstate', checkForTrackingEvents);

    // 3. SPA-style navigation (e.g., Cloudbeds internal navigation without full page reload)
    // Overrides pushState to detect internal route changes
    (function(history) {
        const push = history.pushState;
        history.pushState = function() {
            push.apply(this, arguments);
            // Add a small delay to allow Cloudbeds to render new content after navigation
            setTimeout(checkForTrackingEvents, 50);
        };
    })(window.history);

    // Also call on initial script load in case the user lands directly on a relevant page
    // and DOMContentLoaded might have already fired for very fast loading pages.
    checkForTrackingEvents();

})();









/* === Home-Place Suites • dynamic date-badge v11 (re-centered & simplified) ====================== */
(() => {
  /* === SETTINGS ===================================================== */
  const NIGHTLY = 70; // This is primarily for calculating the "Original Price"
  const WEEKLY = 299;
  const MONTHLY = 1099;
  const WEEK_N = +(WEEKLY / 7).toFixed(2); // Calculate daily rate from weekly
  const BADGE_CLASS = 'hp-deal-badge'; // Unique class for your "Pay 50% now" badge
  const MESSAGE_CLASS = 'hp-nights-message'; // Unique class for the info message
  const MIN_NIGHTS_FOR_DEAL = 7; // Minimum nights for the "Pay 50% now" deal (and to hide the info message)
  const MONTHLY_NIGHTS_THRESHOLD = 30; // Used in the info message text

  // Regex to recognize the date range format (e.g., "Jul 8, 2025 – Jul 15, 2025")
  const DATE_RANGE_REGEX = /^[A-Z][a-z]{2} \d{1,2}, \d{4}\s*[-–—]\s*[A-Z][a-z]{2} \d{1,2}, \d{4}$/;
  // Regex to recognize the price text (case-insensitive)
  const PRICE_TEXT_REGEX = /price in usd/i;

  // Primary selector for the main calendar popover. This is the most robust one found.
  const POPOVER_SELECTOR = 'div[role="dialog"][data-be-popover="true"]';

  /* === HELPERS ====================================================== */

  /**
   * Checks if a string looks like a date range using the defined regex.
   * @param {string} s The text content to check.
   * @returns {boolean} True if it matches the date range format.
   */
  const looksLikeRange = s => DATE_RANGE_REGEX.test(s.trim());

  /**
   * Parses a date string into a Date object.
   * @param {string} s The date string.
   * @returns {Date} A Date object.
   */
  const parseDate = s => new Date(s);

  /**
   * Calculates the number of nights between two Date objects.
   * @param {Date} a The first date (check-in).
   * @param {Date} b The second date (check-out).
   * @returns {number} The number of nights.
   */
  const nightsBetween = (a, b) => Math.round((b - a) / (1000 * 60 * 60 * 24));

  /**
   * Finds the paragraph element containing the date range.
   * Searches within a specified scope or the entire document.
   * @param {HTMLElement} [scope=document] The DOM element to search within.
   * @returns {HTMLParagraphElement|undefined} The date range P tag if found.
   */
  const findDateP = (scope = document) =>
    [...scope.querySelectorAll('p[data-be-text], p.cb-text')]
    .find(p => looksLikeRange(p.textContent));

  /**
   * Finds the paragraph element containing the "Price in USD" text.
   * Searches within a specified scope or the entire document.
   * @param {HTMLElement} [scope=document] The DOM element to search within.
   * @returns {HTMLParagraphElement|undefined} The price P tag if found.
   */
  const findPriceP = (scope = document) =>
    [...scope.querySelectorAll('p[data-be-text], p.cb-text')]
    .find(p => PRICE_TEXT_REGEX.test(p.textContent));

  /**
   * Builds the 'Pay 50% now' badge element with simplified pricing and improved styling.
   * @param {number} nights The number of nights for the stay.
   * @returns {HTMLDivElement} The constructed badge element.
   */
  function buildDealBadge(nights) {
    // Calculate the 'discounted' total based on your tiered pricing
    let discountedTotalRem = nights;
    let discountedTotal = 0;
    discountedTotal += Math.floor(discountedTotalRem / MONTHLY_NIGHTS_THRESHOLD) * MONTHLY;
    discountedTotalRem %= MONTHLY_NIGHTS_THRESHOLD;
    discountedTotal += Math.floor(discountedTotalRem / 7) * WEEKLY;
    discountedTotalRem %= 7;
    discountedTotal += discountedTotalRem * WEEK_N;
    discountedTotal = +discountedTotal.toFixed(2); // Ensure it's a number and rounded

    // Calculate the 'original' total if all nights were at the daily rate
    const originalTotal = (nights * NIGHTLY).toFixed(2);

    // Calculate the 50% down payment
    const half = (discountedTotal / 2).toFixed(2);

    const div = document.createElement('div');
    div.className = BADGE_CLASS;
    // Re-added text-align:center; to the main div's style.
    div.style.cssText =
      'padding:12px;background:#fff;text-align:center;font-size:16px;line-height:1.4;';
    div.innerHTML = `
      <div style="font-size:14px; color:#888; margin-bottom: 5px;">Original Price: <del>$${originalTotal}</del></div>
      <div style="font-size:18px; font-weight:bold; color:#333;">Discounted Total: $${discountedTotal.toFixed(2)}</div>
      <div style="font-size:24px; font-weight:bold; color:#000; margin-top:10px;">
        $${half} today
      </div>
    `;
    return div;
  }

  /**
   * Builds the "Select 7+/30+ nights to unlock discounts" message element.
   * @returns {HTMLDivElement} The constructed message element.
   */
  function buildInfoMessage() {
    const div = document.createElement('div');
    div.className = MESSAGE_CLASS;
    div.style.cssText = `
      padding: 8px 12px;
      text-align: center;
      color: #555;
      font-size: 14px;
      line-height: 1.3;
      border-top: 1px dashed #ddd; /* Example styling, adjust as needed */
      margin-top: 10px; /* Space from elements above */
    `;
    div.innerHTML = `
      <strong style="color: red;">Select 7+ nights to display discount prices right here!</strong>
    `;
    return div;
  }

  /* === CORE LOGIC =================================================== */

  /**
   * Updates or inserts/removes the badge and the info message.
   * @param {HTMLElement} scope The specific element (e.g., the popover) to search within.
   */
  function updateDisplay(scope) {
    if (!scope) {
        console.warn('[Badge/Message] updateDisplay called without a valid scope.');
        return;
    }

    // Always clear any existing badge and message first to prevent duplicates
    scope.querySelectorAll('.' + BADGE_CLASS).forEach(el => el.remove());
    scope.querySelectorAll('.' + MESSAGE_CLASS).forEach(el => el.remove());

    const dateP = findDateP(scope);
    const priceP = findPriceP(scope);

    // Find a reference point to insert our elements.
    // Prioritize inserting after the Price P, otherwise after the last calendar month container.
    let insertionPoint = priceP && priceP.parentElement; // Element to insert after the price paragraph
    if (!insertionPoint) {
        // Fallback: Try to find the last calendar month container or general calendar div
        insertionPoint = scope.querySelector('[data-testid="calendar"] > .month-container:last-child');
        if (!insertionPoint) {
             insertionPoint = scope.querySelector('[data-testid="calendar"]'); // General calendar div
        }
        if (!insertionPoint) {
            console.warn('[Badge/Message] No suitable insertion point found for message or badge.');
            return; // Can't find where to insert
        }
    }

    let nights = 0;
    if (dateP) {
      const [d1s, d2s] = dateP.textContent.trim().split(/\s*[-–—]\s*/);
      const d1 = parseDate(d1s);
      const d2 = parseDate(d2s);
      if (!isNaN(d1) && !isNaN(d2)) {
        nights = nightsBetween(d1, d2);
      }
    }

    if (nights >= MIN_NIGHTS_FOR_DEAL) {
      // If 7+ nights, show the deal badge
      if (priceP && priceP.parentElement) {
        // Insert the badge right after the "Price in USD" line's parent
        priceP.parentElement.insertAdjacentElement('afterend', buildDealBadge(nights));
        console.info('[Badge] Deal badge shown for', nights, 'nights.');
      } else {
        console.warn('[Badge] Could not find price element to insert deal badge.');
      }
    } else {
      // If less than 7 nights (or no dates selected yet), show the info message
      if (insertionPoint) {
          insertionPoint.insertAdjacentElement('afterend', buildInfoMessage());
          console.info('[Message] Info message shown.');
      }
    }
  }

  /* === INITIALIZATION & OBSERVATION =============================== */

  /**
   * Attempts to attach the MutationObserver to the calendar popover.
   * Retries if the popover is not yet present in the DOM.
   */
  (function attachObserver() {
    const popoverElement = document.querySelector(POPOVER_SELECTOR);

    if (!popoverElement) {
      console.log('[Badge/Message] Calendar popover not found, retrying...');
      return setTimeout(attachObserver, 200);
    }

    let debounceTimer;
    const onMutate = () => {
      clearTimeout(debounceTimer);
      // Pass the detected popoverElement as the scope to updateDisplay
      debounceTimer = setTimeout(() => updateDisplay(popoverElement), 50);
    };

    new MutationObserver(onMutate)
      .observe(popoverElement, {
        subtree: true,         // Observe all descendants
        childList: true,       // Observe additions/removals of child nodes
        characterData: true,   // Observe changes to text content (e.g., date updates)
        // attributes: true       // Optional: uncomment if needed for attribute changes
      });

    // Initial display update when the popover first appears
    updateDisplay(popoverElement);
    console.info('[Badge/Message] MutationObserver attached to calendar popover.');
  })();

})();


(function() {
    // --- Configuration ---
    const TARGET_SUMMARY_SELECTOR = '.chakra-stack.styles_summary__8d3CF.d-1jjq5p5';
    const BANNER_HTML = `
        <div id="cancellation-banner" style="box-sizing: border-box; width: 100%; background: #d4f4dd; color: #084c22; padding: 12px 16px; font-size: 14px; font-weight: 500; text-align: center; border-bottom: 1px solid #0a6b39; margin-bottom: 8px; display: block; clear: both;">
            ✅ Free cancellation up to <strong>7 days before</strong> arrival. Have a quick question before proceeding? Call 918-212-6296 and we'll help you out!
        </div>
    `;

    const INITIAL_CHECK_INTERVAL_MS = 100;
    const INITIAL_CHECK_MAX_ATTEMPTS = 50;

    let initialCheckAttempt = 0;
    let initialCheckIntervalId = null;
    let observer = null;

    console.log('%c[Cancellation Banner] Script loaded.', 'color: #1E90FF; font-weight: bold;');

    function insertBanner() {
        const target = document.querySelector(TARGET_SUMMARY_SELECTOR);
        const existingBanner = document.getElementById('cancellation-banner');

        if (!target) {
            return false;
        }

        // If the banner already exists, check if it's the *previous sibling* of the target.
        if (existingBanner && existingBanner.nextElementSibling === target) {
            return true;
        }

        // *** CHANGED INSERTION METHOD HERE ***
        target.insertAdjacentHTML('beforebegin', BANNER_HTML);
        console.log('%c[Cancellation Banner] Banner inserted BEFORE the summary container.', 'color: #32CD32;');

        const newBanner = document.getElementById('cancellation-banner');
        if (newBanner && newBanner.nextElementSibling === target) {
            console.log('%c[Cancellation Banner] Banner created successfully.', 'color: #32CD32;');
            return true;
        } else {
            console.warn('%c[Cancellation Banner] Banner not found or not positioned correctly after insertion.', 'color: #FF4500;');
            return false;
        }
    }

    function initializeBannerObserver() {
        if (observer) {
            observer.disconnect();
        }

        const mainContainer = document.getElementById('cb-bookingengine') || document.body;

        observer = new MutationObserver((mutationsList, observer) => {
            const relevantMutation = mutationsList.some(mutation =>
                mutation.type === 'childList' ||
                (mutation.type === 'attributes' && (
                    mutation.target.matches(TARGET_SUMMARY_SELECTOR) ||
                    (mutation.target.id === 'cancellation-banner' && mutation.target.nextElementSibling && mutation.target.nextElementSibling.matches(TARGET_SUMMARY_SELECTOR)) // Check if our banner's attributes change AND it's a sibling
                )) ||
                (mutation.type === 'characterData' && mutation.target.parentNode && mutation.target.parentNode.matches(TARGET_SUMMARY_SELECTOR))
            );

            if (relevantMutation) {
                clearTimeout(window._bannerInsertDebounceTimer);
                window._bannerInsertDebounceTimer = setTimeout(() => {
                    const currentBanner = document.getElementById('cancellation-banner');
                    const currentTarget = document.querySelector(TARGET_SUMMARY_SELECTOR);

                    // Check if banner is missing OR not positioned correctly (before the target)
                    if (!currentBanner || !currentTarget || !(currentBanner.nextElementSibling === currentTarget)) {
                        console.log('%c[Cancellation Banner] Mutation detected and banner is missing or moved. Attempting re-insertion...', 'color: #DAA520;');
                        insertBanner();
                    }
                }, 50);
            }
        });

        observer.observe(mainContainer, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
        });
        console.log('%c[Cancellation Banner] MutationObserver attached to main container for resilience.', 'color: #1E90FF;');
    }

    function handleUrlChange() {
        const currentUrl = window.location.href;
        const isTargetPage = currentUrl.includes('/reservation/') && currentUrl.includes('/guests');

        if (isTargetPage) {
            console.log(`%c[Cancellation Banner] On target guests page. Preparing to insert banner.`, 'color: #1E90FF;');

            if (initialCheckIntervalId) {
                clearInterval(initialCheckIntervalId);
                initialCheckIntervalId = null;
            }
            if (observer) {
                observer.disconnect();
                observer = null;
            }

            initialCheckAttempt = 0;
            console.log(`%c[Cancellation Banner] Started initial checks every ${INITIAL_CHECK_INTERVAL_MS}ms for up to ${INITIAL_CHECK_MAX_ATTEMPTS * INITIAL_CHECK_INTERVAL_MS / 1000} seconds.`, 'color: #1E90FF;');
            initialCheckIntervalId = setInterval(() => {
                if (insertBanner() || initialCheckAttempt >= INITIAL_CHECK_MAX_ATTEMPTS) {
                    clearInterval(initialCheckIntervalId);
                    initialCheckIntervalId = null;
                    if (initialCheckAttempt >= INITIAL_CHECK_MAX_ATTEMPTS) {
                        console.warn('%c[Cancellation Banner] Max initial check attempts reached. Target or banner not found/persisted reliably.', 'color: #FF4500;');
                    } else {
                        initializeBannerObserver();
                    }
                }
                initialCheckAttempt++;
            }, INITIAL_CHECK_INTERVAL_MS);

        } else {
            console.log('[Cancellation Banner] Not on target guests page. Clearing intervals/observers.');
            if (initialCheckIntervalId) clearInterval(initialCheckIntervalId);
            if (observer) observer.disconnect();
            initialCheckIntervalId = null;
            observer = null;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        console.log('[Cancellation Banner] DOMContentLoaded fired.');
        handleUrlChange();
    });

    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        console.log('[Cancellation Banner] history.pushState detected.');
        setTimeout(handleUrlChange, 50);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        console.log('[Cancellation Banner] history.replaceState detected.');
        setTimeout(handleUrlChange, 50);
    };

    handleUrlChange();
})();


/* ==============================================================================
   Cloudbeds Deposit Clarification Script (v3.5 - Room Selection Page ONLY)
   - Now suppresses clarification if "Only Pay" text is detected.
   - Fixed regex to handle thousands separators in price parsing.
   ============================================================================== */
(function() {
    // --- Configuration ---
    const ROOM_PRICE_SELECTOR = 'p.cb-rate-plan-price[data-be-text="true"]';
    const SUMMARY_TOTAL_PRICE_SELECTOR = 'p[data-testid="shopping-cart-summary-grand-total"]';
    const BANNER_TOTAL_PRICE_SELECTOR = 'p[data-testid="shopping-cart-banner-grand-total"]';
    const CLARIFICATION_TEXT_HTML_CONTENT_TEMPLATE = `
        <span style="color: #33e857; font-weight: bold;">({depositAmount} Today)</span>
    `;
    const CURRENCY_SYMBOL = 'USD';
    const DEPOSIT_PERCENTAGE = 0.50;

    const INLINE_CLARIFICATION_STYLE = `
        color: #FF0000;
        font-weight: bold;
        font-size: 0.9em;
        margin-left: 5px;
    `;

    const INITIAL_CHECK_INTERVAL_MS = 100;
    const INITIAL_CHECK_MAX_ATTEMPTS = 50;
    const PERSISTENT_RECHECK_INTERVAL_MS = 300;

    let initialCheckAttempt = 0;
    let initialCheckIntervalId = null;
    let persistentRecheckIntervalId = null;
    let observer = null;

    console.log('%c[Deposit Clarification] Script loaded (v3.5 - Room Selection Page ONLY, "Only Pay" suppression, thousands separator fix).', 'color: #008080; font-weight: bold;');

    // --- Utility Functions ---

    function getDepositAmount(totalPriceStr, percentage) {
        try {
            // Extract only the original total, ignoring anything in parentheses
            const numericMatch = totalPriceStr.replace(/\s*\(.*\)/, '').match(/(?:USD\s*)?(\d{1,3}(,\d{3})*\.\d{2})/);
            if (!numericMatch || !numericMatch[1]) {
                console.warn('[Deposit Clarification] No valid total found in:', totalPriceStr);
                return null;
            }
            // Remove commas from the matched number and parse as float
            const numericPart = parseFloat(numericMatch[1].replace(/,/g, ''));
            if (isNaN(numericPart) || numericPart <= 0.01) {
                console.warn('[Deposit Clarification] Invalid total:', numericPart, 'from:', totalPriceStr);
                return null;
            }
            const deposit = numericPart * percentage;
            if (deposit <= 0.01) {
                console.warn('[Deposit Clarification] Deposit too low:', deposit, 'from total:', numericPart);
                return null;
            }
            console.log('[Deposit Clarification] Extracted total:', numericPart, 'Deposit:', deposit);
            return `${CURRENCY_SYMBOL} ${deposit.toFixed(2)}`;
        } catch (e) {
            console.error('[Deposit Clarification] Error calculating deposit:', e, 'Input:', totalPriceStr);
            return null;
        }
    }

    function insertClarification(priceElement, uniqueIdSuffix) {
        if (!priceElement) return false;

        // NEW LOGIC: Check if the "Only Pay" text is already present in the parent element
        // If it is, we should not insert THIS script's deposit clarification.
        if (priceElement.textContent.includes('Only Pay')) {
            const existingClarificationSpan = priceElement.querySelector(`#hp-deposit-clarification-${uniqueIdSuffix}`);
            if (existingClarificationSpan) {
                existingClarificationSpan.remove(); // Remove our own span if it somehow got there
                console.log(`%c[Deposit Clarification] Removed existing clarification for ${uniqueIdSuffix} due to "Only Pay" text.`, 'color: #FFA500;');
            }
            console.log(`%c[Deposit Clarification] "Only Pay" text detected in ${uniqueIdSuffix}. Skipping deposit clarification.`, 'color: #DAA520;');
            return false; // Indicate that no clarification was inserted by this function
        }

        const currentTotalPrice = priceElement.textContent.trim();
        const depositAmount = getDepositAmount(currentTotalPrice, DEPOSIT_PERCENTAGE);

        if (depositAmount) {
            let clarificationSpan = priceElement.querySelector(`#hp-deposit-clarification-${uniqueIdSuffix}`);
            const newContent = CLARIFICATION_TEXT_HTML_CONTENT_TEMPLATE.replace('{depositAmount}', depositAmount);

            if (clarificationSpan) {
                if (clarificationSpan.innerHTML.trim() !== newContent.trim()) {
                    clarificationSpan.innerHTML = newContent;
                    console.log(`%c[Deposit Clarification] Updated ${uniqueIdSuffix} to ${depositAmount}.`, 'color: #32CD32;');
                }
            } else {
                try {
                    clarificationSpan = document.createElement('span');
                    clarificationSpan.id = `hp-deposit-clarification-${uniqueIdSuffix}`;
                    clarificationSpan.style.cssText = INLINE_CLARIFICATION_STYLE;
                    clarificationSpan.innerHTML = newContent;
                    priceElement.appendChild(clarificationSpan);
                    console.log(`%c[Deposit Clarification] Inserted ${uniqueIdSuffix}: ${depositAmount}`, 'color: #32CD32;');
                } catch (e) {
                    console.error(`[Deposit Clarification] Error inserting ${uniqueIdSuffix}:`, e);
                    return false;
                }
            }
            return true;
        }
        console.log(`%c[Deposit Clarification] No valid deposit for ${uniqueIdSuffix}, skipping.`, 'color: #DAA520;');
        return false;
    }

    function attemptInsertionLogic() {
        let insertedAny = false;

        const roomPriceElements = document.querySelectorAll(ROOM_PRICE_SELECTOR);
        roomPriceElements.forEach((priceElement, index) => {
            insertedAny = insertClarification(priceElement, `room-${index}`) || insertedAny;
        });

        const summaryTotalPriceElement = document.querySelector(SUMMARY_TOTAL_PRICE_SELECTOR);
        if (summaryTotalPriceElement) {
            insertedAny = insertClarification(summaryTotalPriceElement, 'summary-total') || insertedAny;
        }

        const bannerTotalPriceElement = document.querySelector(BANNER_TOTAL_PRICE_SELECTOR);
        if (bannerTotalPriceElement) {
            insertedAny = insertClarification(bannerTotalPriceElement, 'banner-total') || insertedAny;
        }

        if (insertedAny) {
            if (!persistentRecheckIntervalId) {
                console.log(`%c[Deposit Clarification] Starting persistent re-checks every ${PERSISTENT_RECHECK_INTERVAL_MS}ms.`, 'color: #008080;');
                persistentRecheckIntervalId = setInterval(() => {
                    const currentRoomPrices = document.querySelectorAll(ROOM_PRICE_SELECTOR);
                    const currentSummaryTotal = document.querySelector(SUMMARY_TOTAL_PRICE_SELECTOR);
                    const currentBannerTotal = document.querySelector(BANNER_TOTAL_PRICE_SELECTOR);

                    let needsReinsertion = false;
                    currentRoomPrices.forEach((priceEl, index) => {
                        // Only re-insert if our span is missing AND the "Only Pay" text is NOT there
                        if (!priceEl.querySelector(`#hp-deposit-clarification-room-${index}`) && !priceEl.textContent.includes('Only Pay')) {
                            needsReinsertion = true;
                        }
                    });
                    if (currentSummaryTotal && !currentSummaryTotal.querySelector('#hp-deposit-clarification-summary-total') && !currentSummaryTotal.textContent.includes('Only Pay')) {
                        needsReinsertion = true;
                    }
                    if (currentBannerTotal && !currentBannerTotal.querySelector('#hp-deposit-clarification-banner-total') && !currentBannerTotal.textContent.includes('Only Pay')) {
                        needsReinsertion = true;
                    }

                    if (needsReinsertion) {
                        console.warn('%c[Deposit Clarification] Persistent re-check: Clarification missing. Re-inserting...', 'color: #DAA520;');
                        attemptInsertionLogic();
                    }
                }, PERSISTENT_RECHECK_INTERVAL_MS);
            }

            if (initialCheckIntervalId) {
                clearInterval(initialCheckIntervalId);
                initialCheckIntervalId = null;
                console.log('[Deposit Clarification] Initial check interval cleared.');
            }
            return true;
        }
        return false;
    }

    // --- Mutation Observer ---
    function initializeDepositObserver() {
        if (observer) {
            observer.disconnect();
            console.log('[Deposit Clarification] Old observer disconnected.');
        }

        const mainBookingEngine = document.getElementById('cb-bookingengine') || document.body;

        if (mainBookingEngine === document.body) {
            console.warn(`%c[Deposit Clarification] Observing 'body' due to missing booking engine root.`, 'color: #FFA500;');
        } else {
            console.log(`%c[Deposit Clarification] MutationObserver attached to main booking engine.`, 'color: #008080;');
        }

        observer = new MutationObserver((mutationsList) => {
            const relevantMutation = mutationsList.some(mutation => {
                // Check for mutations that involve the prices or their children
                const target = mutation.target;
                if (target && (
                    target.matches(ROOM_PRICE_SELECTOR) ||
                    target.matches(SUMMARY_TOTAL_PRICE_SELECTOR) ||
                    target.matches(BANNER_TOTAL_PRICE_SELECTOR) ||
                    (target.parentNode && (
                        target.parentNode.matches(ROOM_PRICE_SELECTOR) ||
                        target.parentNode.matches(SUMMARY_TOTAL_PRICE_SELECTOR) ||
                        target.parentNode.matches(BANNER_TOTAL_PRICE_SELECTOR)
                    ))
                )) {
                    // Always re-attempt insertion logic if a price element is mutated
                    // The insertion logic itself now handles the "Only Pay" suppression
                    return true;
                }
                // Also trigger on childList changes anywhere within the observed tree, as content might change
                if (mutation.type === 'childList' && mainBookingEngine.contains(mutation.target)) return true;
                return false;
            });

            if (relevantMutation) {
                console.log('[Deposit Clarification] Relevant mutation detected, re-inserting.');
                attemptInsertionLogic();
            }
        });

        observer.observe(mainBookingEngine, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'data-testid', 'data-be-text'] // Ensure relevant attributes are monitored
        });
        console.log(`%c[Deposit Clarification] MutationObserver attached for resilience.`, 'color: #008080;');
    }

    // --- Main Execution Flow ---
    function handleUrlChange() {
        const currentUrl = window.location.href;
        const isRoomSelectionPage = /\/reservation\/[a-zA-Z0-9]+\/?(?!\/guests)/.test(currentUrl);

        if (isRoomSelectionPage) {
            console.log(`%c[Deposit Clarification] On room selection page. Preparing insertion.`, 'color: #008080;');

            // Clear all previous intervals/observers to prevent duplicates on URL change
            if (initialCheckIntervalId) clearInterval(initialCheckIntervalId);
            if (persistentRecheckIntervalId) clearInterval(persistentRecheckIntervalId);
            if (observer) observer.disconnect();
            initialCheckIntervalId = null;
            persistentRecheckIntervalId = null;
            observer = null; // Reset observer reference

            initialCheckAttempt = 0;
            console.log(`%c[Deposit Clarification] Starting checks every ${INITIAL_CHECK_INTERVAL_MS}ms for ${INITIAL_CHECK_MAX_ATTEMPTS * INITIAL_CHECK_INTERVAL_MS / 1000} seconds.`, 'color: #008080;');
            
            // Initial interval to find elements and insert clarifications
            initialCheckIntervalId = setInterval(() => {
                if (attemptInsertionLogic() || initialCheckAttempt >= INITIAL_CHECK_MAX_ATTEMPTS) {
                    clearInterval(initialCheckIntervalId);
                    initialCheckIntervalId = null;
                    if (initialCheckAttempt >= INITIAL_CHECK_MAX_ATTEMPTS) {
                        console.warn('%c[Deposit Clarification] Max attempts reached, elements not found during initial check.', 'color: #FF4500;');
                    }
                    initializeDepositObserver(); // Always initialize observer after initial checks
                }
                initialCheckAttempt++;
            }, INITIAL_CHECK_INTERVAL_MS);
        } else {
            console.log('[Deposit Clarification] Not on room selection page. Clearing intervals/observers.');
            if (initialCheckIntervalId) clearInterval(initialCheckIntervalId);
            if (persistentRecheckIntervalId) clearInterval(persistentRecheckIntervalId);
            if (observer) observer.disconnect();
            initialCheckIntervalId = null;
            persistentRecheckIntervalId = null;
            observer = null;
        }
    }

    // --- Event Listeners for URL Changes ---
    // Ensure the script runs when the DOM is loaded
    document.addEventListener('DOMContentLoaded', handleUrlChange);

    // Override pushState and replaceState to detect SPA navigation
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        console.log('[Deposit Clarification] history.pushState detected.');
        setTimeout(handleUrlChange, 50); // Small delay to allow DOM updates
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        console.log('[Deposit Clarification] history.replaceState detected.');
        setTimeout(handleUrlChange, 50); // Small delay to allow DOM updates
    };

    // Initial call in case script loads after DOMContentLoaded or for direct page loads
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        handleUrlChange();
    }
})();



(function() {
    const SUBTOTAL_SELECTOR = 'p[data-testid="shopping-cart-summary-total"]';
    const TAXES_FEES_SELECTOR = 'p[data-testid="shopping-cart-summary-taxes-and-fees"]';
    const GRAND_TOTAL_SELECTOR = 'p[data-testid="shopping-cart-summary-grand-total"]';
    const BANNER_GRAND_TOTAL_SELECTOR = 'p[data-testid="shopping-cart-banner-grand-total"]';

    const POLL_INTERVAL_MS = 300; // Less aggressive polling
    const MAX_POLL_ATTEMPTS = 200; // 60 seconds

    let pollAttempts = 0;
    let pollInterval = null;

    console.log('%c--- DEPOSIT REWRITE (Subtotal-Based, Taxes in Balance) ---', 'color: #008080; font-weight: bold;');
    console.log(`Polling every ${POLL_INTERVAL_MS / 1000} seconds for subtotal: ${SUBTOTAL_SELECTOR} and taxes: ${TAXES_FEES_SELECTOR}`);

    function parsePrice(text) {
        const cleanedText = text.replace(/USD\s*/g, '').replace(/,/g, '').trim();
        const numericMatch = cleanedText.match(/(\d+\.\d{2})/);
        return numericMatch && numericMatch[1] ? parseFloat(numericMatch[1]) : 0;
    }

    function applyDepositChanges() {
        pollAttempts++;
        const subtotalElement = document.querySelector(SUBTOTAL_SELECTOR);
        const taxesFeesElement = document.querySelector(TAXES_FEES_SELECTOR);
        const grandTotalElement = document.querySelector(GRAND_TOTAL_SELECTOR);
        const bannerGrandTotalElement = document.querySelector(BANNER_GRAND_TOTAL_SELECTOR);

        if (subtotalElement && taxesFeesElement && (grandTotalElement || bannerGrandTotalElement)) {
            const subtotal = parsePrice(subtotalElement.textContent);
            const taxesFees = parsePrice(taxesFeesElement.textContent);
            if (subtotal > 0 && taxesFees >= 0) {
                console.log('%cSUCCESS: Non-zero subtotal and taxes found!', 'color: #28a745; font-weight: bold;', `Subtotal: ${subtotal}, Taxes/Fees: ${taxesFees}`);
                clearInterval(pollInterval);
                pollInterval = null;

                try {
                    const halfSubtotal = (subtotal / 2).toFixed(2);
                    const balance = (subtotal / 2 + taxesFees).toFixed(2);
                    const grandContent = `
                        <span style="color: #33e857; font-weight: bold; font-size: 0.9em;">Only Pay USD ${halfSubtotal} Today</span>
                        <br>
                        <span style="color: #666; font-size: 0.7em;">Balance (USD ${balance}) When you arrive</span>
                    `;
                    const bannerContent = `Only Pay USD ${halfSubtotal} Today`;

                    if (grandTotalElement) {
                        grandTotalElement.innerHTML = grandContent;
                        grandTotalElement.style.textAlign = 'left';
                        grandTotalElement.style.whiteSpace = 'nowrap';
                        console.log('%cACTION: Grand total text rewritten!', 'color: #007bff; font-weight: bold;');
                    }

                    if (bannerGrandTotalElement) {
                        bannerGrandTotalElement.innerHTML = bannerContent;
                        bannerGrandTotalElement.style.color = '#33e857';
                        bannerGrandTotalElement.style.fontWeight = 'bold';
                        bannerGrandTotalElement.style.fontSize = '1em';
                        bannerGrandTotalElement.style.textAlign = 'center';
                        bannerGrandTotalElement.style.whiteSpace = 'nowrap';
                        console.log('%cACTION: Banner grand total text rewritten!', 'color: #007bff; font-weight: bold;');
                    }
                } catch (error) {
                    console.error('%cERROR: Problem during deposit rewrite!', 'color: #dc3545; font-weight: bold;', error);
                }
            } else {
                console.log(`Attempt ${pollAttempts}: Subtotal or taxes invalid (Subtotal: ${subtotal}, Taxes/Fees: ${taxesFees}). Retrying...`);
                if (grandTotalElement) {
                    grandTotalElement.innerHTML = '<span style="color: #666; font-size: 0.9em;">Loading Deposit and Balance...</span>';
                }
                if (bannerGrandTotalElement) {
                    bannerGrandTotalElement.innerHTML = 'Loading Deposit...';
                }
            }
        } else {
            console.log(`Attempt ${pollAttempts}: Subtotal, taxes, or grand total elements not found. Retrying...`);
            if (grandTotalElement) {
                grandTotalElement.innerHTML = '<span style="color: #666; font-size: 0.9em;">Loading Deposit and Balance...</span>';
            }
            if (bannerGrandTotalElement) {
                bannerGrandTotalElement.innerHTML = 'Loading Deposit...';
            }
        }

        if (pollAttempts >= MAX_POLL_ATTEMPTS && pollInterval !== null) {
            console.warn('%cWARNING: Max poll attempts reached. Stopping.', 'color: #dc3545; font-weight: bold;');
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    function startPollingSafely() {
        if (!pollInterval) {
            pollInterval = setInterval(applyDepositChanges, POLL_INTERVAL_MS);
        }
    }

    document.addEventListener('DOMContentLoaded', startPollingSafely);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        startPollingSafely();
    }

    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        console.log('%c[SPA] history.pushState detected.', 'color: #008080;');
        setTimeout(() => {
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = null;
            pollAttempts = 0;
            startPollingSafely();
        }, 50);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        console.log('%c[SPA] history.replaceState detected.', 'color: #008080;');
        setTimeout(() => {
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = null;
            pollAttempts = 0;
            startPollingSafely();
        }, 50);
    };
})();




(function() {
    // --- Configuration ---
    const TARGET_SELECTOR = '.chakra-stack.cb-page-title.d-1r1cngs';
    const MESSAGE_ID = 'hp-security-message';
    const MESSAGE_HTML = `
        <span id="${MESSAGE_ID}" style="color: #000000; font-weight: bold; font-size: 0.9em; margin-left: 10px;">
            &#128274; 256‑bit secure checkout
        </span>
    `;
    const POLL_INTERVAL_MS = 100; // Check every 100ms
    const MAX_POLL_ATTEMPTS = 300; // Max 30 seconds of polling
    const TARGET_PAGE_REGEX = /\/reservation\/[a-zA-Z0-9]+\/payment/i; // Only run on payment page

    let pollAttempts = 0;
    let pollInterval = null;
    let observer = null;

    console.log('%c[Security Message] Script loaded.', 'color: #008080; font-weight: bold;');
    console.log(`Polling every ${POLL_INTERVAL_MS / 1000} seconds for target element: ${TARGET_SELECTOR}`);
    console.log(`Will stop after ${MAX_POLL_ATTEMPTS} attempts if target not found or immediately after insertion.`);

    // --- Utility Functions ---

    /**
     * Inserts the "256 bit..." message next to the target element and stops polling.
     * @returns {boolean} True if the message was inserted, false otherwise.
     */
    function insertMessage() {
        const targetElement = document.querySelector(TARGET_SELECTOR);
        if (!targetElement) {
            console.log(`Attempt ${pollAttempts}: Target element not found yet. Retrying...`);
            return false;
        }

        const existingMessage = document.getElementById(MESSAGE_ID);
        if (existingMessage && existingMessage.parentElement === targetElement) {
            console.log('%c[Security Message] Message already exists in correct position. Stopping polling.', 'color: #32CD32;');
            clearInterval(pollInterval);
            pollInterval = null;
            return true; // Message already exists, stop polling
        }

        // Remove any stray message elements elsewhere in the DOM
        if (existingMessage) {
            existingMessage.remove();
            console.log('%c[Security Message] Removed stray message from incorrect location.', 'color: #DAA520;');
        }

        try {
            targetElement.insertAdjacentHTML('beforeend', MESSAGE_HTML);
            console.log('%c[Security Message] Successfully inserted message. Stopping polling.', 'color: #32CD32;');
            clearInterval(pollInterval); // Stop polling immediately after insertion
            pollInterval = null;
            return true;
        } catch (error) {
            console.error('%c[Security Message] Error inserting message:', 'color: #dc3545; font-weight: bold;', error);
            return false;
        }
    }

    /**
     * Sets up a MutationObserver to watch for the target element's appearance.
     */
    function initializeObserver() {
        if (observer) {
            observer.disconnect();
            console.log('[Security Message] Previous observer disconnected.');
        }

        const mainContainer = document.getElementById('cb-bookingengine') || document.body;
        console.log(`%c[Security Message] Observing ${mainContainer === document.body ? 'body' : 'cb-bookingengine'}.`, 'color: #008080;');

        observer = new MutationObserver((mutationsList) => {
            const relevantMutation = mutationsList.some(mutation => {
                if (mutation.type === 'childList') {
                    return Array.from(mutation.addedNodes).some(node => 
                        node.nodeType === 1 && (node.matches(TARGET_SELECTOR) || node.querySelector(TARGET_SELECTOR))
                    );
                }
                return false;
            });

            if (relevantMutation && !document.getElementById(MESSAGE_ID)) {
                console.log('%c[Security Message] Target element added to DOM. Attempting insertion...', 'color: #DAA520;');
                if (insertMessage()) {
                    observer.disconnect(); // Stop observing after successful insertion
                    observer = null;
                    console.log('%c[Security Message] Observer disconnected after successful insertion.', 'color: #008080;');
                }
            }
        });

        observer.observe(mainContainer, {
            childList: true,
            subtree: true
        });
        console.log('%c[Security Message] MutationObserver attached.', 'color: #008080;');
    }

    /**
     * Main function to handle URL changes and trigger polling/observer setup.
     */
    function handleUrlChange() {
        const currentUrl = window.location.href;
        const isPaymentPage = TARGET_PAGE_REGEX.test(currentUrl);

        if (isPaymentPage) {
            console.log('%c[Security Message] On payment page. Starting polling and observer.', 'color: #008080;');
            
            // Clear existing intervals/observers
            if (pollInterval) clearInterval(pollInterval);
            if (observer) observer.disconnect();
            pollInterval = null;
            observer = null;
            pollAttempts = 0;

            // Start polling
            pollInterval = setInterval(() => {
                pollAttempts++;
                if (insertMessage() || pollAttempts >= MAX_POLL_ATTEMPTS) {
                    clearInterval(pollInterval);
                    pollInterval = null;
                    if (pollAttempts >= MAX_POLL_ATTEMPTS) {
                        console.warn('%c[Security Message] Max poll attempts reached without finding target.', 'color: #dc3545;');
                    }
                    initializeObserver(); // Start observer even if max attempts reached, in case target appears later
                }
            }, POLL_INTERVAL_MS);

            // Initialize observer immediately to catch dynamic additions
            initializeObserver();
        } else {
            console.log('[Security Message] Not on payment page. Clearing intervals/observers.');
            if (pollInterval) clearInterval(pollInterval);
            if (observer) observer.disconnect();
            pollInterval = null;
            observer = null;
            // Remove message if present
            const existingMessage = document.getElementById(MESSAGE_ID);
            if (existingMessage) {
                existingMessage.remove();
                console.log('%c[Security Message] Removed message from non-payment page.', 'color: #DAA520;');
            }
        }
    }

    // --- Event Listeners ---
    document.addEventListener('DOMContentLoaded', handleUrlChange);

    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        console.log('[Security Message] history.pushState detected.');
        setTimeout(handleUrlChange, 50);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        console.log('[Security Message] history.replaceState detected.');
        setTimeout(handleUrlChange, 50);
    };

    // Initial call for direct page loads
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        handleUrlChange();
    }
})();



</script>
