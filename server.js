require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'Public')));

const CLIENT_ID = process.env.CLIENT_ID || "1081371104056-1pblrjipaasn78nnb7slcp18o2355dn3.apps.googleusercontent.com";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "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";
const REDIRECT_URI = process.env.REDIRECT_URI || "https://digital-alubm-qr.onrender.com/oauth2callback";

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

let isConnected = false;

app.get('/auth/google', (req, res) => {
  const scopes = ['https://www.googleapis.com/auth/drive'];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    isConnected = true;
    res.redirect('/?auth=success');
  } catch (error) {
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

app.post('/api/create-project', async (req, res) => {
  if (!isConnected) return res.json({ success: false, error: 'Pehle Google Drive connect karein!' });
  try {
    const { projectName } = req.body;
    google.options({ auth: oauth2Client });
    const drive = google.drive({ version: 'v3' });

    const folder = await drive.files.create({
      resource: { name: projectName, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });

    res.json({ success: true, folderId: folder.data.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/project/:folderId', async (req, res) => {
  if (!isConnected) return res.json({ success: false, error: 'Pehle Google Drive connect karein!' });
  try {
    const { folderId } = req.params;
    google.options({ auth: oauth2Client });
    const drive = google.drive({ version: 'v3' });

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: 'files(id, name)',
      orderBy: 'name',
    });

    const files = response.data.files.map(file => ({
      id: file.id,
      name: file.name,
      directUrl: `/api/image/${file.id}` // Secure Proxy URL
    }));

    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Secure Image Proxy Route (Bypasses Drive Public Permission Issues)
app.get('/api/image/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    google.options({ auth: oauth2Client });
    const drive = google.drive({ version: 'v3' });

    const fileMeta = await drive.files.get({ fileId: fileId, fields: 'mimeType' });
    res.setHeader('Content-Type', fileMeta.data.mimeType || 'image/jpeg');

    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    response.data.pipe(res);
  } catch (error) {
    res.status(500).send('Error loading image from Drive');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
