const printer = require('printer');

async function print(printer_id, content, options) {
  // Decode base64 content and send to printer
  const buffer = Buffer.from(content, 'base64');
  return new Promise((resolve, reject) => {
    printer.printDirect({
      data: buffer,
      printer: printer_id,
      type: 'RAW',
      options: options || {},
      success: (jobID) => resolve({ jobId: jobID }),
      error: reject,
    });
  });
}

module.exports = { print };
