const ImageKit = require('imagekit');

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || 'public_hwM9hldZI+DqFY/pncPQCA5VRWo=',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || 'private_jlKYx/irEGETTo3ReUTEWeeXbaM=',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/Theprimestar',
});

module.exports = function handler(req, res) {
  try {
    const authParams = imagekit.getAuthenticationParameters();
    res.status(200).json(authParams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
