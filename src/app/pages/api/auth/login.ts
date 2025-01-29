import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';

interface LoginRequestBody {
  username: string;
  password: string;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { username, password } = req.body as LoginRequestBody;

    // Validate credentials (in a real app, you'd check a database)
    if (username === 'user' && password === 'password') {
      // Create a JWT token
      const token = jwt.sign({ username }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
      res.status(200).json({ token });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } else {
    res.status(405).json({ message: 'Method Not Allowed' });
  }
}