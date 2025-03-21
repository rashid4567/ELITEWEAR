const express = require('express')
const router = express.Router()
const userControllers = require('../controller/user/userControll')


router.get('/login',userControllers.userLogin)
router.get('/signup',userControllers.loadUserSignup)
router.get('/pageNotfound',userControllers.pageNotfound)
router.get('/',userControllers.loadHOmepage);
router.post('/signup',userControllers.userSignup)

module.exports = router
