// Web Bluetooth thermal printer helper.
// Targets ESC/POS compatible printers (e.g. PT-260).
// Falls back gracefully when the browser doesn't support Web Bluetooth.

const PRINTER_SERVICE = 0x18f0; // Common SPP service for many thermal printers
const PRINTER_CHARACTERISTIC = 0x2af1;

export function isWebBluetoothSupported() {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

function encodeESC(text: string): Uint8Array {
  const init = [0x1b, 0x40]; // ESC @ reset
  const cut = [0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]; // feed + partial cut
  const enc = new TextEncoder();
  const body = enc.encode(text + "\n");
  return new Uint8Array([...init, ...body, ...cut]);
}

export async function printToThermal(content: string): Promise<void> {
  if (!isWebBluetoothSupported()) {
    throw new Error("Web Bluetooth is not available in this browser. Use Chrome on Android or Desktop over HTTPS.");
  }
  const bt = (navigator as any).bluetooth;
  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: [PRINTER_SERVICE, "000018f0-0000-1000-8000-00805f9b34fb"],
  });
  const server = await device.gatt.connect();
  let characteristic;
  try {
    const service = await server.getPrimaryService(PRINTER_SERVICE);
    characteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC);
  } catch {
    // Try string UUID form
    const service = await server.getPrimaryService("000018f0-0000-1000-8000-00805f9b34fb");
    characteristic = await service.getCharacteristic("00002af1-0000-1000-8000-00805f9b34fb");
  }
  const bytes = encodeESC(content);
  // chunk to ~180 bytes
  const CHUNK = 180;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await characteristic.writeValueWithoutResponse(bytes.slice(i, i + CHUNK));
  }
  await server.disconnect();
}
