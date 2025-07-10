const express = require('express');
const router = express.Router();
const discovery = require('../services/discovery');

router.get('/devices', async (req, res) => {
  try {
    const devices = await discovery.getDevices();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: 'Device discovery failed' });
  }
});

module.exports = router;
