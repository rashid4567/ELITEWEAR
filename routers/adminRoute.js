const express = require('express');
const router = express.Router();
const adminControll = require('../controller/admin/adminControll');

router.get('/login', adminControll.loadLogin);
router.get('/',adminControll.login)
router.get('/',adminControll.loadDashboard)

module.exports = router;
