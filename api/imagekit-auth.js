import ImageKit from 'imagekit';

const imagekit = new ImageKit({
  publicKey: 'public_hwM9hldZI+DqFY/pncPQCA5VRWo=',
  privateKey: 'private_jlKYx/irEGETTo3ReUTEWeeXbaM=',
  urlEndpoint: 'https://ik.imagekit.io/Theprimestar',
});

export default function handler(req, res) {
  const authParams = imagekit.getAuthenticationParameters();
  res.status(200).json(authParams);
}
