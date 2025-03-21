const express = require('express')
const app = express()
const PORT = process.env.PORT || 5002;

app.get('/',(req,res)=>{
    res.send("hello")
})

app.listen(PORT,()=>{
    console.log(`server is running on http://127.0.0.1:${PORT}`)
})
