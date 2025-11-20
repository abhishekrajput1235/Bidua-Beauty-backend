const Contact = require("../models/Contact");
const sendEmail = require("../utils/email");
const { successResponse, errorResponse } = require("../utils/responseHandler");

exports.createContact = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return errorResponse(res, "All fields are required", 400);
    }

    const newContact = new Contact({
      name,
      email,
      subject,
      message,
    });

    await newContact.save();

    // Send confirmation email to the user
    const userEmailOptions = {
      to: email,
      subject: "Thank you for contacting Bidua Beauty!",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Hello ${name},</h2>
          <p>Thank you for reaching out to us. We have received your message and will get back to you as soon as possible.</p>
          <p><strong>Your Message:</strong></p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p>${message}</p>
          <br>
          <p>Best regards,</p>
          <p>The Bidua Beauty Team</p>
        </div>
      `,
    };
    await sendEmail(userEmailOptions);

    // Send notification email to the admin
    const adminEmailOptions = {
      to: process.env.ADMIN_EMAIL, // Add ADMIN_EMAIL to your .env file
      subject: "New Contact Form Submission",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>New message from ${name}</h2>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        </div>
      `,
    };
    await sendEmail(adminEmailOptions);

    successResponse(res, "Message sent successfully", newContact, 201);
  } catch (error) {
    console.error("Error creating contact:", error);
    errorResponse(res, "Server error", 500);
  }
};
