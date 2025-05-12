const nodemailer = require("nodemailer")
require("dotenv").config()


const transporter = nodemailer.createTransport({
  secure: true,
  host: "smtp.gmail.com",
  port: 465,
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD,
  },
})

const createContactMailOptions = (from, name, subject, message) => ({
  from: `"Elite Wear Contact" <${process.env.NODEMAILER_EMAIL}>`,
  to: process.env.NODEMAILER_EMAIL, 
  replyTo: from, 
  subject: `Contact Form: ${subject}`,
  html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Elite Wear Contact Form</title>
      <style>
        :root {
          --primary-color: #0f172a;
          --secondary-color: #f8fafc;
          --accent-color: #3b82f6;
          --accent-hover: #2563eb;
          --accent-secondary: #8b5cf6;
          --text-primary: #1e293b;
          --text-secondary: #64748b;
          --border-color: #e2e8f0;
        }
        
        body {
          font-family: 'Outfit', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: var(--text-primary);
          margin: 0;
          padding: 0;
          background-color: #f9fafb;
        }
        
        .email-container {
          max-width: 600px;
          margin: 20px auto;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }
        
        .email-header {
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          padding: 30px 24px;
          text-align: center;
        }
        
        .email-header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
          letter-spacing: 1px;
          font-weight: 700;
        }
        
        .email-body {
          padding: 32px 24px;
          background-color: #ffffff;
        }
        
        .email-body p {
          margin: 0 0 16px;
          font-size: 16px;
          color: var(--text-primary);
        }
        
        .message-container {
          margin: 24px 0;
          padding: 20px;
          background-color: #f8fafc;
          border-radius: 8px;
          border-left: 4px solid var(--accent-color);
        }
        
        .message-text {
          font-size: 16px;
          color: var(--text-primary);
          white-space: pre-wrap;
          line-height: 1.6;
        }
        
        .contact-info {
          margin-top: 24px;
          padding: 20px;
          background: linear-gradient(to right, #f0f9ff, #e0f2fe);
          border-radius: 8px;
        }
        
        .contact-info p {
          margin: 8px 0;
          font-size: 15px;
        }
        
        .contact-label {
          font-weight: 600;
          color: var(--accent-color);
          display: inline-block;
          width: 80px;
        }
        
        .email-footer {
          padding: 20px 24px;
          background-color: #f1f5f9;
          text-align: center;
          font-size: 14px;
          color: var(--text-secondary);
        }
        
        .email-footer p {
          margin: 8px 0;
        }
        
        .timestamp {
          font-size: 14px;
          color: var(--text-secondary);
          margin-top: 24px;
          text-align: right;
          font-style: italic;
        }
        
        .action-button {
          display: inline-block;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: 600;
          margin-top: 24px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <h1>ELITE WEAR</h1>
        </div>
        <div class="email-body">
          <p><strong>New Message Alert:</strong> You have received a new message from the contact form on your website.</p>
          
          <div class="contact-info">
            <p><span class="contact-label">Name:</span> ${name}</p>
            <p><span class="contact-label">Email:</span> ${from}</p>
            <p><span class="contact-label">Subject:</span> ${subject}</p>
            <p><span class="contact-label">Date:</span> ${new Date().toLocaleString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
          </div>
          
          <h3 style="margin-top: 24px; color: var(--accent-color);">Message Content:</h3>
          <div class="message-container">
            <p class="message-text">${message}</p>
          </div>
          
          <p>Please respond to the customer at your earliest convenience.</p>
          
          <a href="mailto:${from}?subject=RE: ${subject}" class="action-button">Reply to Customer</a>
          
          <p class="timestamp">Received on: ${new Date().toLocaleString()}</p>
        </div>
        <div class="email-footer">
          <p>&copy; ${new Date().getFullYear()} Elite Wear. All rights reserved.</p>
          <p>This is an automated message from your contact form.</p>
        </div>
      </div>
    </body>
    </html>
  `,
});


const createAutoReplyMailOptions = (to, name) => ({
  from: `"Elite Wear" <${process.env.NODEMAILER_EMAIL}>`,
  to,
  subject: "Thank You for Contacting Elite Wear",
  html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Thank You for Contacting Elite Wear</title>
      <style>
        :root {
          --primary-color: #0f172a;
          --secondary-color: #f8fafc;
          --accent-color: #3b82f6;
          --accent-hover: #2563eb;
          --accent-secondary: #8b5cf6;
          --text-primary: #1e293b;
          --text-secondary: #64748b;
          --border-color: #e2e8f0;
        }
        
        body {
          font-family: 'Outfit', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: var(--text-primary);
          margin: 0;
          padding: 0;
          background-color: #f9fafb;
        }
        
        .email-container {
          max-width: 600px;
          margin: 20px auto;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }
        
        .email-header {
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          padding: 30px 24px;
          text-align: center;
        }
        
        .email-header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
          letter-spacing: 1px;
          font-weight: 700;
        }
        
        .email-body {
          padding: 32px 24px;
          background-color: #ffffff;
        }
        
        .email-body p {
          margin: 0 0 16px;
          font-size: 16px;
          color: var(--text-primary);
        }
        
        .greeting {
          font-size: 22px;
          font-weight: 600;
          color: var(--accent-color);
          margin-bottom: 20px;
        }
        
        .highlight {
          font-weight: 600;
          color: var(--accent-color);
        }
        
        .contact-info {
          margin: 24px 0;
          padding: 20px;
          background: linear-gradient(to right, #f0f9ff, #e0f2fe);
          border-radius: 8px;
        }
        
        .contact-info p {
          margin: 8px 0;
          font-size: 15px;
        }
        
        .contact-label {
          font-weight: 600;
          color: var(--accent-color);
          display: inline-block;
          width: 120px;
        }
        
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          color: #ffffff;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: 600;
          margin-top: 16px;
          text-align: center;
        }
        
        .email-footer {
          padding: 20px 24px;
          background-color: #f1f5f9;
          text-align: center;
          font-size: 14px;
          color: var(--text-secondary);
        }
        
        .email-footer p {
          margin: 8px 0;
        }
        
        .social-links {
          margin-top: 24px;
          text-align: center;
        }
        
        .social-links a {
          display: inline-block;
          margin: 0 8px;
          color: var(--accent-color);
          text-decoration: none;
          font-weight: 500;
        }
        
        .featured-products {
          margin-top: 32px;
          text-align: center;
        }
        
        .featured-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--accent-color);
          margin-bottom: 16px;
          text-align: center;
        }
        
        .product-grid {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-bottom: 24px;
        }
        
        .product-item {
          width: 150px;
          text-align: center;
        }
        
        .product-image {
          width: 100%;
          height: auto;
          border-radius: 8px;
          margin-bottom: 8px;
        }
        
        .product-name {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        
        .product-price {
          font-size: 14px;
          color: var(--accent-color);
          font-weight: 600;
        }
        
        .button-container {
          text-align: center;
          margin-top: 24px;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <h1>ELITE WEAR</h1>
        </div>
        <div class="email-body">
          <p class="greeting">Dear ${name},</p>
          <p>Thank you for contacting Elite Wear. We have received your message and appreciate your interest in our products.</p>
          <p>Our team will review your inquiry and get back to you as soon as possible, usually within 24-48 hours.</p>
          
          <div class="contact-info">
            <p><span class="contact-label">Phone:</span> +91 98765 43210</p>
            <p><span class="contact-label">Email:</span> elitewear39@gmail.com</p>
            <p><span class="contact-label">Working Hours:</span> Monday - Saturday: 10:00 AM - 8:00 PM<br>
            <span style="padding-left: 124px;">Sunday: 11:00 AM - 6:00 PM</span></p>
            <p><span class="contact-label">Location:</span> Brototype Kochi, Infopark, Kochi, Kerala, India</p>
          </div>
          
          
          
          <div class="button-container">
            <a href="https://www.elitewear.com/collections" class="button">Explore Collections</a>
          </div>
          
          <p style="margin-top: 32px;">Thank you for choosing Elite Wear.</p>
          
          <p>Best Regards,<br>The Elite Wear Team</p>
          
          <div class="social-links">
            <p>Follow us on social media:</p>
            <a href="https://facebook.com/elitewear">Facebook</a> |
            <a href="https://instagram.com/elitewear">Instagram</a> |
            <a href="https://twitter.com/elitewear">Twitter</a>
          </div>
        </div>
        <div class="email-footer">
          <p>&copy; ${new Date().getFullYear()} Elite Wear. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `,
});


const contactController = {

  getContactPage: (req, res) => {
    res.render("contact", {
      title: "Contact Us | Elite Wear",
    })
  },


  sendContactMessage: async (req, res) => {
    try {
      const { name, email, subject, message } = req.body

      const errors = {}
      if (!name || name.trim() === "") {
        errors.name = "Name is required"
      }
      if (!email || email.trim() === "") {
        errors.email = "Email is required"
      } else if (!/^[\w-.+]+@([\w-]+\.)+[\w-]{2,8}$/.test(email)) {
        errors.email = "Please enter a valid email address"
      }
      if (!subject || subject.trim() === "") {
        errors.subject = "Subject is required"
      }
      if (!message || message.trim() === "") {
        errors.message = "Message is required"
      }

     
      if (Object.keys(errors).length > 0) {
        return res.render("contact", {
          title: "Contact Us | Elite Wear",
          errors,
          formData: { name, email, subject, message },
          error: "Please correct the errors in the form",
        })
      }

   
      const adminMailOptions = createContactMailOptions(email, name, subject, message)


      const customerMailOptions = createAutoReplyMailOptions(email, name)

   
      const adminInfo = await transporter.sendMail(adminMailOptions)

  
      const customerInfo = await transporter.sendMail(customerMailOptions)


      if (adminInfo && customerInfo) {
        return res.render("contact", {
          title: "Contact Us | Elite Wear",
          success: "Your message has been sent successfully. We'll get back to you soon!",
        })
      } else {
        throw new Error("Failed to send email")
      }
    } catch (error) {
      console.error("Error sending contact email:", error)
      return res.render("contact", {
        title: "Contact Us | Elite Wear",
        error: "There was an error sending your message. Please try again later.",
        formData: req.body,
      })
    }
  },
}

module.exports = contactController
