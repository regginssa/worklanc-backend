const format = require("../utils/format");

const uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No resume file provided" });
    }

    const fileUrl = `/uploads/resumes/${req.file.filename}`;

    res.status(200).json({
      resume: format.toCamelCase({
        file_name: req.file.originalname,
        stored_name: req.file.filename,
        file_url: fileUrl,
        mime_type: req.file.mimetype,
        size: req.file.size,
        import_source: "resume",
      }),
    });
  } catch (e) {
    console.error("uploadResume error: ", e);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { uploadResume };
