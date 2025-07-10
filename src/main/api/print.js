const express = require('express');
const router = express.Router();
const printerService = require('../services/printer');

router.post('/print', async (req, res) => {
  const { printer_id, content, options } = req.body;
  try {
    const result = await printerService.print(printer_id, content, options);
    res.json({ status: 'success', job_id: result.jobId });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Print job failed' });
  }
});

module.exports = router;
