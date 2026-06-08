const sendTestimonialRequestEmail = async ({
  clientEmail,
  clientFirstName,
  talentName,
  requestMessage,
  confirmUrl,
}) => {
  const payload = {
    to: clientEmail,
    subject: `${talentName} requested a testimonial on WorkLanc`,
    body: [
      `Hi ${clientFirstName},`,
      "",
      `${talentName} would like you to share a testimonial about your work together.`,
      "",
      requestMessage,
      "",
      `Please confirm and submit your testimonial here: ${confirmUrl}`,
    ].join("\n"),
  };

  // Wire to your email provider when available (SES, Resend, etc.).
  console.info("[testimonial-email]", payload);

  return true;
};

module.exports = { sendTestimonialRequestEmail };
