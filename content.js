// content.js

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
}

function scrapeData() {
    // 1. Job Number
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
    let state = stateEl ? stateEl.options[stateEl.selectedIndex]?.text : "";
    if (!state) state = "";

    let email = getVal('ctlInsuredEmail');

    return {
        jobNumber,
        clientName,
        address: addr,
        city,
        state,
        zip,
        email
    };
}

function parsePhoneNumber(rawText) {
    // Remove "+01" if present (assuming it might be a prefix)
    let text = rawText.replace(/\+01/g, '');
    
    // Find the number logic: look for sequence of digits that looks like a phone number
    // Regex for (xxx) xxx-xxxx or xxx-xxx-xxxx or xxxxxxxxxx
    const phoneRegex = /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?/i;
    
    // A simpler regex to catch most US numbers and separate text
    // Matches 10 digits potentially with delimiters
    const simplePhoneRegex = /(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/;
    
    const match = text.match(simplePhoneRegex);
    
    if (match) {
        const number = match[0].replace(/[^0-9]/g, ''); // Clean to just digits
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;
        
        const before = text.substring(0, startIndex).trim();
        const after = text.substring(endIndex).trim();
        
        return {
            number: number,
            extraText: (before + " " + after).trim(),
            formatted: match[0]
        };
    }
    
    return {
        number: text.replace(/[^0-9]/g, ''),
        extraText: text.replace(/[0-9()\-+.]/g, '').trim(),
        formatted: text
    };
}

function createVCard(data, phoneInfo, contactType) {
    // Format Name: [Job number]- [Cleaned client name] - [ Any text before the phone number + Any text after the phone number]
    const fullName = `${data.jobNumber} - ${data.clientName} - ${phoneInfo.extraText}`.trim().replace(/\s+-\s*$/, '');
    
    let vcard = "BEGIN:VCARD\n";
    vcard += "VERSION:3.0\n";
    vcard += "PRODID:-//Tromis Extension//EN\n";
    vcard += `FN;CHARSET=utf-8:${fullName}\n`;
    vcard += `N;CHARSET=utf-8:${fullName};;;;\n`; // Putting full name in family name field for simplicity or splitting? Better to just put formatted name.
    
    if (phoneInfo.number) {
        vcard += `TEL;TYPE=${contactType}:${phoneInfo.number}\n`;
    }
    
    if (data.email) {
        vcard += `EMAIL:${data.email}\n`;
    }
    
    // Address
    // ADR fields: PO Box; Extended Address; Street Address; Locality (City); Region (State); Postal Code; Country Name
    if (data.address || data.city || data.state || data.zip) {
        vcard += `ADR;TYPE=work;CHARSET=utf-8:;;${data.address || ''};${data.city || ''};${data.state || ''};${data.zip || ''};;\n`;
    }
    
    vcard += "END:VCARD";
    return vcard;
}

function downloadVCard(filename, content) {
    const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function addDownloadButton(inputId, contactType) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const btn = document.createElement('button');
    btn.textContent = "Download Contact";
    btn.type = "button";
    btn.style.marginLeft = "10px";
    btn.style.fontSize = "12px";
    btn.style.cursor = "pointer";
    btn.style.backgroundColor = "#4CAF50";
    btn.style.color = "white";
    btn.style.border = "none";
    btn.style.padding = "5px 10px";
    btn.style.borderRadius = "3px";
    
    btn.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent form submission if inside a form
        
        const rawPhone = input.value;
        if (!rawPhone) {
            alert("No phone number entered.");
            return;
        }
        
        const data = scrapeData();
        const phoneInfo = parsePhoneNumber(rawPhone);
        
        const vcardContent = createVCard(data, phoneInfo, contactType);
        
        // Clean filename
        const safeName = `${data.jobNumber}_${data.clientName}`.replace(/[^a-z0-9]/gi, '_');
        downloadVCard(`${safeName}_${contactType}.vcf`, vcardContent);
    });
    
    // Insert after input
    const container = document.createElement('div');
    container.style.marginTop = "5px";
    container.appendChild(btn);
    
    if (input.nextSibling) {
        input.parentNode.insertBefore(container, input.nextSibling);
    } else {
        input.parentNode.appendChild(container);
    }
}

// Initial run
function init() {
    // Wait a bit for dynamic content if needed, but usually content scripts run at document_idle
    addDownloadButton('ctlPhone', 'cell');
    addDownloadButton('ctlPhone2', 'home'); // Or work/other
}

// Check if we are on the right page? Manifest handles this, but good to be safe if multiple matches
if (location.href.includes('orderdtl.jsp') || document.querySelector('#ctlPhone')) {
    init();
}
