const express = require('express');
const router = express.Router();
const scannerService = require('../services/scanner');

router.post('/scan', async (req, res) => {
  const { scanner_id, options } = req.body;
  try {
    const scanData = await scannerService.scan(scanner_id, options);
    res.json({ status: 'success', data: scanData });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

module.exports = router;
