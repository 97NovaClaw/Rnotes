document.addEventListener('DOMContentLoaded', () => {

    // --- UTILITIES ---
    function showStatus(message, statusElement, isError = false) {
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.style.color = isError ? 'crimson' : 'green';
            setTimeout(() => {
                if (statusElement.textContent === message) statusElement.textContent = '';
            }, isError ? 4000 : 3000);
        }
    }

    function copyToClipboard(text, successMessage, statusElement) {
        navigator.clipboard.writeText(text).then(() => {
            showStatus(successMessage, statusElement, false);
        }).catch(err => {
            console.error('Failed to copy', err);
            showStatus('Failed to copy.', statusElement, true);
        });
    }

    // --- 1. TROMIS TURBO DROPDOWN ---
    const toggleButton = document.getElementById('toggleButton');
    const dropdownContent = document.getElementById('dropdownContent');
    const jobLinkBtn = document.getElementById('jobLinkBtn');
    const jobNumberInput = document.getElementById('jobNumber');

    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            const isDisplayed = dropdownContent.style.display === 'block';
            dropdownContent.style.display = isDisplayed ? 'none' : 'block';
        });
    }

    if (jobLinkBtn) {
        jobLinkBtn.addEventListener('click', () => {
            const num = jobNumberInput.value.trim();
            if (num) window.open(`https://tromis.northparkcleaners.com/NorthPark/orderdtl.jsp?oId=${num}`, '_blank');
        });
    }

    if (jobNumberInput) {
        jobNumberInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                jobLinkBtn.click();
            }
        });
    }

    // --- 2. TAB NAVIGATION ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const activeTabId = button.dataset.tab;
            document.getElementById(activeTabId).classList.add('active');
        });
    });

    // --- 3. RESTORNET NOTES ---
    const copyRestornetBtn = document.getElementById('copyBtn');
    if (copyRestornetBtn) {
        copyRestornetBtn.addEventListener('click', () => {
            const stream = document.getElementById('streamSelect').value;
            const type = document.getElementById('typeSelect').value;
            const noteText = document.getElementById('noteText').value;
            const statusEl = document.getElementById('restornetStatus');

            if (!noteText.trim()) {
                showStatus('Note text cannot be empty.', statusEl, true);
                return;
            }
            const header = "==============================================\n" +
                           `${type} - ${stream}\n` +
                           "==============================================\n";
            copyToClipboard(header + noteText, 'Restornet note copied!', statusEl);
        });
    }

    // --- 4. TROMIS LOG ---
    const tromisTableBody = document.querySelector('#tromisTable tbody');
    const tromisLogStatusEl = document.getElementById('tromisLogStatus');
    const tromisStreams = [
        { id: 'sc', name: 'SC', fullName: 'Soft Content' },
        { id: 'elc', name: 'ELC', fullName: 'Electronics' },
        { id: 'art', name: 'ART', fullName: 'Art' },
        { id: 'con', name: 'CON', fullName: 'Content' }
    ];

    if (tromisTableBody) {
        tromisStreams.forEach(stream => {
            const row = tromisTableBody.insertRow();
            row.dataset.streamId = stream.id;
            row.innerHTML = `<td>${stream.fullName}</td>
                <td><input type="date" id="date-${stream.id}"></td>
                <td><button class="today-btn">Today</button></td>`;
            row.querySelector('.today-btn').addEventListener('click', () => {
                row.querySelector('input').value = new Date().toISOString().split('T')[0];
            });
        });
    }

    const copyTromisLogBtn = document.getElementById('copyTromisLogBtn');
    if (copyTromisLogBtn) {
        copyTromisLogBtn.addEventListener('click', () => {
            let tempOutput = '';
            let hasDateSet = false;
            tromisTableBody.querySelectorAll('tr').forEach(row => {
                const streamId = row.dataset.streamId;
                const streamInfo = tromisStreams.find(s => s.id === streamId);
                const dateInput = row.querySelector('input');
                if (dateInput && dateInput.value && streamInfo) {
                    hasDateSet = true;
                    const d = new Date(dateInput.value + 'T00:00:00');
                    const fmt = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                    tempOutput += `[${streamInfo.name}: ${fmt}]`;
                }
            });
            if (!hasDateSet) {
                showStatus('No dates set.', tromisLogStatusEl, true);
                return;
            }
            copyToClipboard("Cleaned Status: " + tempOutput, 'Tromis log copied!', tromisLogStatusEl);
        });
    }

    document.getElementById('generateFromPageBtn')?.addEventListener('click', async () => {
        showStatus('Reading page...', tromisLogStatusEl, false);
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0].url.includes('tromis.northparkcleaners.com')) {
                showStatus('Not on Tromis page.', tromisLogStatusEl, true);
                return;
            }
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: () => { return document.querySelector('#ctlNotesStatic')?.innerText; }
            });
            
            if (results?.[0]?.result) {
                const text = results[0].result;
                const regex = /\[(SC|ELC|ART|CON):\s*([^\]]+)\]/gi;
                let match;
                let found = 0;
                while ((match = regex.exec(text)) !== null) {
                    const row = tromisTableBody.querySelector(`tr[data-stream-id="${match[1].toLowerCase()}"]`);
                    if (row) {
                        const d = new Date(match[2].trim());
                        if (!isNaN(d)) {
                            row.querySelector('input').value = d.toISOString().split('T')[0];
                            found++;
                        }
                    }
                }
                showStatus(found > 0 ? 'Log updated.' : 'No log entries found.', tromisLogStatusEl, found === 0);
            }
        } catch (e) { showStatus('Error reading page.', tromisLogStatusEl, true); }
    });

    // ==========================================
    // NEW: GOOGLE DRIVE AUTOMATION LOGIC
    // ==========================================
    const scrapeJobBtn = document.getElementById('scrapeJobDataBtn');
    const createDriveBtn = document.getElementById('createDriveFolderBtn');
    const driveStatusEl = document.getElementById('driveStatus');
    const driveLinkContainer = document.getElementById('driveLinkContainer');
    const driveLink = document.getElementById('driveLink');

    // UI Inputs
    const d_jobNumber = document.getElementById('d_jobNumber');
    const d_claimNumber = document.getElementById('d_claimNumber');
    const d_clientName = document.getElementById('d_clientName');
    const d_address = document.getElementById('d_address');
    const d_city = document.getElementById('d_city');
    const d_state = document.getElementById('d_state');
    const d_zip = document.getElementById('d_zip');
    const d_phone = document.getElementById('d_phone');
    const d_phone2 = document.getElementById('d_phone2');
    const d_email = document.getElementById('d_email');

    if (scrapeJobBtn) {
        scrapeJobBtn.addEventListener('click', async () => {
            showStatus('Scraping job details...', driveStatusEl, false);
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tabs[0]?.url?.includes('tromis.northparkcleaners.com')) {
                    showStatus('Not on a Tromis page.', driveStatusEl, true);
                    return;
                }

                const results = await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    function: scrapeTromisJobDetails, 
                });

                if (results && results[0] && results[0].result) {
                    const data = results[0].result;
                    
                    // Populate Fields
                    d_jobNumber.value = data.jobNumber || "";
                    d_claimNumber.value = data.claimNumber || "";
                    d_clientName.value = data.clientName || "";
                    d_address.value = data.address || "";
                    d_city.value = data.city || "";
                    d_state.value = data.state || "";
                    d_zip.value = data.zip || "";
                    d_phone.value = data.phone || "";
                    d_phone2.value = data.phone2 || "";
                    d_email.value = data.email || "";

                    if (data.jobNumber) {
                        showStatus('Data scraped successfully.', driveStatusEl, false);
                        createDriveBtn.disabled = false;
                        createDriveBtn.style.opacity = "1";
                        createDriveBtn.style.cursor = "pointer";
                    } else {
                        showStatus('Could not find Job Number.', driveStatusEl, true);
                    }
                }
            } catch (error) {
                console.error(error);
                showStatus('Error scraping page.', driveStatusEl, true);
            }
        });
    }

    if (createDriveBtn) {
        createDriveBtn.addEventListener('click', () => {
            // Construct Payload with ALL individual fields + convenience full strings
            const payload = {
                jobNumber: d_jobNumber.value,
                claimNumber: d_claimNumber.value,
                clientName: d_clientName.value,
                address: d_address.value,
                city: d_city.value,
                state: d_state.value,
                zip: d_zip.value,
                phone: d_phone.value,
                phone2: d_phone2.value,
                email: d_email.value,
                // Convenience: Construct full address and phone strings for templates
                fullAddress: `${d_address.value}, ${d_city.value}, ${d_state.value} ${d_zip.value}`,
                fullPhones: `${d_phone.value} ${d_phone2.value ? ', ' + d_phone2.value : ''}`
            };

            showStatus('Sending to Auto-Pilot...', driveStatusEl, false);
            createDriveBtn.disabled = true;

            // *** IMPORTANT: REPLACE WITH YOUR WORDPRESS URL ***
            const WP_API_URL = "https://YOUR-WORDPRESS-DOMAIN.com/wp-json/crdn/v1/create-job";

            fetch(WP_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(response => response.json())
            .then(data => {
                createDriveBtn.disabled = false;
                if (data.status === 'success') {
                    showStatus('Success! Folder Created.', driveStatusEl, false);
                    driveLink.href = data.folder_link;
                    driveLinkContainer.style.display = 'block';
                } else {
                    showStatus('Error: ' + (data.message || 'Unknown error'), driveStatusEl, true);
                }
            })
            .catch(error => {
                createDriveBtn.disabled = false;
                console.error('API Error:', error);
                showStatus('Connection failed. Check console.', driveStatusEl, true);
            });
        });
    }

    // Injected Scraper Function
    function scrapeTromisJobDetails() {
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : "";
        };

        // 1. Job Number (Specific selector from user)
        const jobNumEl = document.querySelector('#tblOrderHdr > tbody > tr:nth-child(1) > td.tdi');
        let jobNumber = jobNumEl ? jobNumEl.innerText.trim().split(/\s+/)[0] : "";

        // 2. Client Name (Cleaned up)
        let rawName = getVal('ctlInsured'); // "DEHGHANI, Elaheh (XA) (*) (H)"
        let clientName = rawName.split('(')[0].trim(); // "DEHGHANI, Elaheh"

        // 3. Address Components
        let addr = getVal('ctlAddress');
        let city = getVal('ctlCity');
        let zip = getVal('ctlInsuredZip');
        
        // State is a dropdown, need text
        let stateEl = document.getElementById('ctlState');
        let state = stateEl ? stateEl.options[stateEl.selectedIndex].text : "";

        // 4. Contact Info
        let phone = getVal('ctlPhone');
        let phone2 = getVal('ctlPhone2');
        let email = getVal('ctlInsuredEmail');
        let claimNum = getVal('ctlClaim');

        return {
            jobNumber: jobNumber,
            clientName: clientName,
            address: addr,
            city: city,
            state: state,
            zip: zip,
            phone: phone,
            phone2: phone2,
            email: email,
            claimNumber: claimNum
        };
    }

    // ==========================================
    // VCARD GENERATION LOGIC
    // ==========================================

    /**
     * Parses messy phone input like:
     * "Daughter Diane (905) 869-5712"
     * "Mother (primary) 905-336-2311 - Deceased"
     * 
     * Returns: { 
     *   cleanNumber: "9058695712", 
     *   textBefore: "Daughter Diane",
     *   textAfter: "Deceased",
     *   allText: "Daughter Diane Deceased"
     * }
     */
    function parsePhoneField(rawPhone) {
        if (!rawPhone || !rawPhone.trim()) {
            return null;
        }

        // Remove +1, +01, etc. at the start
        let cleaned = rawPhone.replace(/^\+0?1\s*/gi, '');

        // Extract the phone number (digits, parentheses, hyphens, spaces)
        // Match patterns like: (905) 869-5712, 905-336-2311, 9058695712
        const phonePattern = /[\(\s]*(\d{3})[\)\s\-\.]*(\d{3})[\s\-\.]*(\d{4})/;
        const match = cleaned.match(phonePattern);

        if (!match) {
            return null; // No valid phone number found
        }

        const cleanNumber = match[1] + match[2] + match[3]; // e.g., "9058695712"
        const fullMatch = match[0]; // The matched phone portion
        const matchIndex = cleaned.indexOf(fullMatch);

        // Text before the phone number
        const textBefore = cleaned.substring(0, matchIndex).trim();

        // Text after the phone number
        const textAfter = cleaned.substring(matchIndex + fullMatch.length).trim();

        // Clean up text (remove common separators and parentheses)
        const cleanText = (text) => {
            return text
                .replace(/[\(\)]/g, '') // Remove parentheses
                .replace(/^[\-\–\—\:]+/, '') // Remove leading dashes/colons
                .replace(/[\-\–\—\:]+$/, '') // Remove trailing dashes/colons
                .replace(/\s+/g, ' ') // Normalize spaces
                .trim();
        };

        const cleanedBefore = cleanText(textBefore);
        const cleanedAfter = cleanText(textAfter);

        // Combine all text
        const allText = [cleanedBefore, cleanedAfter]
            .filter(t => t.length > 0)
            .join(' ');

        return {
            cleanNumber: cleanNumber,
            textBefore: cleanedBefore,
            textAfter: cleanedAfter,
            allText: allText
        };
    }

    /**
     * Generates a vCard 3.0 string
     */
    function generateVCard(contactData) {
        const {
            fullName,
            lastName,
            firstName,
            organization,
            phone,
            email,
            address,
            city,
            state,
            zip
        } = contactData;

        let vcard = "BEGIN:VCARD\r\n";
        vcard += "VERSION:3.0\r\n";
        vcard += "PRODID:-//LEGWORKmedia//Rnotes & Workspace 1.6//EN\r\n";
        vcard += `UID:rnotes-${Date.now()}-${Math.random().toString(36).substr(2, 9)}\r\n`;

        // Name - FN is the formatted display name
        vcard += `FN:${fullName}\r\n`;
        vcard += `N:${lastName};${firstName};;;\r\n`;

        // Organization
        if (organization) {
            vcard += `ORG:${organization}\r\n`;
        }

        // Phone (cleaned, no +1)
        if (phone) {
            vcard += `TEL;TYPE=CELL:${phone}\r\n`;
        }

        // Email
        if (email) {
            vcard += `EMAIL:${email}\r\n`;
        }

        // Address
        if (address || city || state || zip) {
            const addr = address || '';
            const cty = city || '';
            const st = state || '';
            const zp = zip || '';
            vcard += `ADR;TYPE=WORK:;;${addr};${cty};${st};${zp};USA\r\n`;
        }

        vcard += "END:VCARD";
        return vcard;
    }

    /**
     * Downloads a vCard file
     */
    function downloadVCard(vcardString, filename) {
        const blob = new Blob([vcardString], { type: 'text/vcard;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Creates and downloads a vCard for a phone field
     */
    function createVCardForPhone(phoneFieldValue, phoneNumber) {
        const jobNum = d_jobNumber.value.trim();
        const clientName = d_clientName.value.trim();
        const claimNum = d_claimNumber.value.trim();
        const addr = d_address.value.trim();
        const city = d_city.value.trim();
        const state = d_state.value.trim();
        const zip = d_zip.value.trim();
        const email = d_email.value.trim();

        if (!jobNum || !clientName) {
            showStatus('Job Number and Client Name required.', driveStatusEl, true);
            return;
        }

        const parsed = parsePhoneField(phoneFieldValue);
        if (!parsed) {
            showStatus(`No valid phone number found in Phone ${phoneNumber}.`, driveStatusEl, true);
            return;
        }

        // Build contact name: [Job#] - [Client Name] - [Extra Text]
        // Use spaces for readability in the contact
        let fullName = `${jobNum} - ${clientName}`;
        if (parsed.allText) {
            fullName += ` - ${parsed.allText}`;
        }

        // For vCard N field, we need Last;First format
        // Split client name properly (format: "LYDEN, Thomas" -> Last: LYDEN, First: Thomas)
        const nameParts = clientName.split(',').map(p => p.trim());
        const lastName = nameParts[0] || clientName;
        const firstName = nameParts[1] || '';
        
        // Build a descriptive first name for N field
        let nFirstName = firstName;
        if (parsed.allText) {
            nFirstName = firstName ? `${firstName} (${parsed.allText})` : parsed.allText;
        }

        const contactData = {
            fullName: fullName,
            lastName: lastName,
            firstName: nFirstName,
            organization: claimNum ? `Claim: ${claimNum}` : 'North Park Cleaners',
            phone: parsed.cleanNumber,
            email: email,
            address: addr,
            city: city,
            state: state,
            zip: zip
        };

        const vcardString = generateVCard(contactData);
        
        // Filename: sanitize for filesystem
        const safeName = fullName.replace(/[^a-z0-9\-\_\s]/gi, '').replace(/\s+/g, '_');
        const filename = `${safeName}.vcf`;

        downloadVCard(vcardString, filename);
        showStatus(`Contact downloaded: ${fullName}`, driveStatusEl, false);
    }

    // Event Listeners for vCard Download Buttons
    const downloadVCard1Btn = document.getElementById('downloadVCard1');
    const downloadVCard2Btn = document.getElementById('downloadVCard2');

    if (downloadVCard1Btn) {
        downloadVCard1Btn.addEventListener('click', () => {
            createVCardForPhone(d_phone.value, 1);
        });
    }

    if (downloadVCard2Btn) {
        downloadVCard2Btn.addEventListener('click', () => {
            createVCardForPhone(d_phone2.value, 2);
        });
    }
});