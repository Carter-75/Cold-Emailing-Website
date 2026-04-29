module.exports = (req, res) => {
  res.status(200).json({
    message: "Direct Vercel Function Reachable",
    time: new Date().toISOString(),
    url: req.url,
    method: req.method
  });
};
