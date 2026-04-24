import ImageKit from 'imagekit';

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || 'public_hwM9hldZI+DqFY/pncPQCA5VRWo=',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || 'private_jlKYx/irEGETTo3ReUTEWeeXbaM=',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/Theprimestar',
});

export default function handler(req, res) {
  try {
    const authParams = imagekit.getAuthenticationParameters();
    res.status(200).json({
      ...authParams,
      _debug: {
        publicKey: imagekit.options.publicKey ? 'present' : 'missing',
        privateKey: imagekit.options.privateKey ? 'present' : 'missing',
        urlEndpoint: imagekit.options.urlEndpoint,
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
