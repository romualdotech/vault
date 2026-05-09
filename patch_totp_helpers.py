from pathlib import Path
path = Path(r'c:\Users\noelr\Documents\Codex\2026-05-09\build-a-system-that-can-store\app.js')
text = path.read_text(encoding='utf-8')
needle = 'function escapeHtml(value) {'
idx = text.find(needle)
if idx == -1:
    raise RuntimeError('needle not found')
insertion = '''function base32Encode(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let output = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    output += alphabet[parseInt(chunk, 2)];
  }
  return output;
}

function generateTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const secret = base32Encode(bytes);
  state.totpSecret = secret;
  renderTotpQr(secret).catch((error) => console.error("Failed to render TOTP QR", error));
  setStatus("totpStatus", "Setup key generated. Scan the QR code or copy the manual key.", "good");
}

async function verifyTotpSetupCode() {
  const code = $("totpVerifyCode").value.trim();
  if (!state.totpSecret) {
    setStatus("totpStatus", "Generate a secret first.", "bad");
    return;
  }
  if (!/^\\d{6}$/.test(code)) {
    setStatus("totpStatus", "Enter a valid 6-digit code.", "bad");
    return;
  }
  const isValid = await verifyTotp(state.totpSecret, code);
  if (isValid) {
    setStatus("totpStatus", "Code valid. Google Authenticator is now set up.", "good");
  } else {
    setStatus("totpStatus", "Invalid code. Please check the app and try again.", "bad");
  }
}

'''
new_text = text[:idx] + insertion + text[idx:]
path.write_text(new_text, encoding='utf-8')
print('inserted helper functions')
