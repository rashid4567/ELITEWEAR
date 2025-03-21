const user = require("../../model/userSChema")

const pageNotfound = async (req,res)=>{
    try{
        return res.render("page-404")
    }catch(error){
        res.redirect("/pageNotfound")
    }
}

const loadHOmepage = async (req,res)=>{
    try{
        return res.render("home")
    }catch(error){
        console.log("Home page is not found")
        res.status(500).send("server error")
    }
}

const userSignup = async (req,res)=>{
    let {name,email,mobile,password} = req.body
    try{
        const newUser = new user({name,email,mobile,password})
        await newUser.save()
        return res.redirect('signup')

    }catch(error){
        console.log("Error to save data",error)
        res.status(500).send("Internal servar error")
    }
}
let loadUserSignup = async (req,res)=>{
    try{
        return res.render('signup')
    }catch(error){
        console.log("signup page is not found")
        res.status(500).send('server issue')
    }
}
let userLogin = async (req,res)=>{
    try{
        return res.render('login')
    }catch{
        console.log("user login page is not found")
        res.status(500).send('server issue')
    }
}
module.exports = {
    loadHOmepage,pageNotfound, userSignup, userLogin, loadUserSignup
}