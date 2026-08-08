import { useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const toolbarOptions = [
  ['bold', 'italic', 'underline'],
  [{ header: 1 }, { header: 2 }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['clean'],
];

function App() {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(1);
  const [ownedDocs, setOwnedDocs] = useState([]);
  const [sharedDocs, setSharedDocs] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('<p>Start typing…</p>');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [feedback, setFeedback] = useState({ type: 'info', text: 'Pick a user and start working.' });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareTargetId, setShareTargetId] = useState(2);
  const [sharePermission, setSharePermission] = useState('view');
  const [docShares, setDocShares] = useState([]);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, header: false, list: false });
  const quillRef = useRef(null);

  const currentUser = useMemo(() => users.find((u) => u.id === currentUserId) || users[0], [users, currentUserId]);
  const dirty = useMemo(() => {
    if (!currentDoc) return false;
    return currentDoc.title !== title || currentDoc.content !== content;
  }, [currentDoc, title, content]);
  const canEdit = currentDoc ? currentDoc.permission === 'owner' || currentDoc.permission === 'edit' : false;
  const isOwner = currentDoc ? currentDoc.permission === 'owner' : false;

  async function api(path, options = {}) {
    const res = await fetch(path, options);
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (error) { body = text; }
    if (!res.ok) throw new Error(body && body.error ? body.error : 'Request failed');
    return body;
  }

  async function reloadDocs() {
    const data = await api(`/api/docs?user=${currentUserId}`);
    setOwnedDocs(data.owned || []);
    setSharedDocs(data.shared || []);
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        const userData = await api('/api/users');
        setUsers(userData);
        await reloadDocs();
      } catch (error) {
        setFeedback({ type: 'error', text: error.message });
      } finally {
        setIsLoading(false);
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    async function refreshAfterUserChange() {
      if (currentDoc && dirty) {
        const confirmed = await confirmSwitch();
        if (!confirmed) return;
      }
      setCurrentDoc(null);
      setTitle('');
      setContent('<p>Start typing…</p>');
      setSelectedDocId('');
      setDocShares([]);
      await reloadDocs();
      setFeedback({ type: 'info', text: `Switched to ${currentUser?.name || 'selected user'}.` });
    }
    refreshAfterUserChange().catch((error) => setFeedback({ type: 'error', text: error.message }));
  }, [currentUserId]);

  function updateActiveFormats() {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const format = editor.getFormat();
    setActiveFormats({
      bold: !!format.bold,
      italic: !!format.italic,
      underline: !!format.underline,
      header: Boolean(format.header),
      list: Boolean(format.list),
    });
  }

  async function confirmSwitch() {
    const save = window.confirm('You have unsaved changes. Press OK to save before switching, or Cancel to choose another option.');
    if (save) {
      const result = await saveDoc();
      return result;
    }
    const discard = window.confirm('Discard unsaved changes and continue? Press OK to discard, Cancel to remain on the document.');
    return discard;
  }

  async function openDoc(id) {
    if (!id) return;
    try {
      if (currentDoc?.id === id) return;
      if (dirty) {
        const confirmed = await confirmSwitch();
        if (!confirmed) return;
      }
      const doc = await api(`/api/docs/${id}?user=${currentUserId}`);
      setCurrentDoc(doc);
      setTitle(doc.title || 'Untitled');
      setContent(doc.content || '<p></p>');
      setSelectedDocId(String(id));
      setFeedback({ type: 'info', text: `Opened ${doc.title}.` });
      // close sidebar on mobile when opening a document
      setSidebarOpen(false);
      if (doc.permission === 'owner') {
        await loadDocShares(id);
      } else {
        setDocShares([]);
      }
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    }
  }

  async function createDoc() {
    try {
      if (dirty) {
        const confirmed = await confirmSwitch();
        if (!confirmed) return;
      }
      const doc = await api(`/api/docs?user=${currentUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '', content: '<p></p>' }),
      });
      // Open the newly created doc to ensure permission and shares are loaded
      await reloadDocs();
      await openDoc(doc.id);
      setFeedback({ type: 'success', text: 'New document created.' });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    }
  }

  async function saveDoc() {
    if (!currentDoc) {
      setFeedback({ type: 'error', text: 'Create or open a document first.' });
      return false;
    }
    if (!canEdit) {
      setFeedback({ type: 'error', text: 'You do not have permission to edit this document.' });
      return false;
    }

    setIsSaving(true);
    try {
      await api(`/api/docs/${currentDoc.id}?user=${currentUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      // Refresh full doc (includes permission) without triggering confirmSwitch
      const full = await api(`/api/docs/${currentDoc.id}?user=${currentUserId}`);
      setCurrentDoc(full);
      setTitle(full.title || 'Untitled');
      setContent(full.content || '<p></p>');
      await reloadDocs();
      setFeedback({ type: 'success', text: 'Saved successfully.' });
      return true;
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteDoc() {
    if (!currentDoc) {
      setFeedback({ type: 'error', text: 'Open a document before deleting it.' });
      return;
    }
    if (!isOwner) {
      setFeedback({ type: 'error', text: 'Only the owner can delete this document.' });
      return;
    }
    if (!window.confirm('Delete this document permanently?')) return;
    try {
      await api(`/api/docs/${currentDoc.id}?user=${currentUserId}`, { method: 'DELETE' });
      setCurrentDoc(null);
      setTitle('');
      setContent('<p>Start typing…</p>');
      setSelectedDocId('');
      setDocShares([]);
      await reloadDocs();
      setFeedback({ type: 'success', text: 'Document deleted.' });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    }
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'md' && ext !== 'txt') {
      setFeedback({ type: 'error', text: 'Unsupported file type. Please upload .txt or .md.' });
      event.target.value = '';
      return;
    }
    const text = await file.text();
    try {
      const result = await api(`/api/upload?user=${currentUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content: text }),
      });
      const doc = await api(`/api/docs?user=${currentUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: result.filename || file.name, content: result.content || '<p></p>' }),
      });
      await reloadDocs();
      await openDoc(doc.id);
      setFeedback({ type: 'success', text: `Imported ${file.name}.` });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    } finally {
      event.target.value = '';
    }
  }

  async function loadDocShares(docId) {
    if (!docId) return;
    try {
      const data = await api(`/api/docs/${docId}/shares?user=${currentUserId}`);
      setDocShares(data.shares || []);
    } catch (error) {
      setDocShares([]);
    }
  }

  async function shareDocument() {
    if (!currentDoc) {
      setFeedback({ type: 'error', text: 'Open a document before sharing it.' });
      return;
    }
    if (!isOwner) {
      setFeedback({ type: 'error', text: 'Only the owner can share this document.' });
      return;
    }
    try {
      await api(`/api/docs/${currentDoc.id}/share?user=${currentUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: Number(shareTargetId), permission: sharePermission }),
      });
      await reloadDocs();
      await loadDocShares(currentDoc.id);
      setFeedback({ type: 'success', text: `Shared document as ${sharePermission} with ${users.find((u) => u.id === Number(shareTargetId))?.name || 'selected user'}.` });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    }
  }

  async function revokeShare(userId) {
    if (!currentDoc) return;
    if (!isOwner) return;
    try {
      await api(`/api/docs/${currentDoc.id}/share?user=${currentUserId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: Number(userId) }),
      });
      await reloadDocs();
      setFeedback({ type: 'success', text: 'Share removed.' });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">AI-Native Docs</div>
        <label className="field">
          <span>Logged in as</span>
          <select value={currentUserId} onChange={(event) => setCurrentUserId(Number(event.target.value))}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </label>

        <div className="section-title">Open document</div>
        <select className="doc-select" value={selectedDocId} onChange={(event) => { const value = event.target.value; if (value) openDoc(Number(value)); }}>
          <option value="">Select a document...</option>
          {ownedDocs.map((doc) => (
            <option key={`owned-${doc.id}`} value={doc.id}>{`Owner: ${doc.title || 'Untitled'}`}</option>
          ))}
          {sharedDocs.map((doc) => (
            <option key={`shared-${doc.id}`} value={doc.id}>{`${doc.title || 'Untitled'} (shared by ${doc.shared_by_name || 'someone'})`}</option>
          ))}
        </select>

        <button className="primary-btn" onClick={createDoc}>New document</button>

        <div className="section-title">My Documents</div>
        <div className="doc-list">
          {ownedDocs.filter((doc) => doc.id !== currentDoc?.id).map((doc) => (
            <button key={doc.id} className="doc-card" onClick={() => openDoc(doc.id)}>
              <strong>{doc.title || 'Untitled'}</strong>
              <small>Owner</small>
            </button>
          ))}
        </div>

        {sharedDocs.length > 0 ? (
          <>
            <div className="section-title">Shared With Me</div>
            <div className="doc-list">
              {sharedDocs.filter((doc) => doc.id !== currentDoc?.id).map((doc) => (
                <button key={doc.id} className="doc-card shared" onClick={() => openDoc(doc.id)}>
                  <strong>{doc.title || 'Untitled'}</strong>
                  <small>{doc.permission === 'edit' ? 'Can edit' : 'View only'}</small>
                </button>
              ))}
            </div>
          </>
        ) : null}

        <div className="upload-block">
          <div className="section-title">Upload</div>
          <p>Supported: .txt and .md files.</p>
          <input type="file" accept=".txt,.md" onChange={uploadFile} />
        </div>

        
      </aside>
      {/* mobile overlay + dynamic sidebar open class handled via CSS */}
      <div className={`mobile-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />

      <main className="editor-pane">
        <div className="header-row">
          <div className="header-row-left">
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
              {sidebarOpen ? '✕' : '☰'}
            </button>
            <input
              className="title-input header-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Document title"
              disabled={!canEdit}
            />
            <div className="action-buttons-inline">
              <button className="primary-btn" onClick={saveDoc} disabled={!canEdit || isSaving || !currentDoc}>
                {isSaving ? 'Saving…' : 'Save'}
              </button>
              <button className="secondary-btn" onClick={deleteDoc} disabled={!isOwner || !currentDoc}>Delete</button>
            </div>
          </div>
          <div className="header-row-right">
            <div className="current-user">User: {currentUser?.name}</div>
            <div className="inline-share">
              <select className="share-user-select" value={shareTargetId} onChange={(event) => setShareTargetId(Number(event.target.value))} disabled={!isOwner || !currentDoc}>
                {users.filter((u) => u.id !== currentUserId).map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <select className="share-perm-select" value={sharePermission} onChange={(event) => setSharePermission(event.target.value)} disabled={!isOwner || !currentDoc}>
                <option value="view">View</option>
                <option value="edit">Edit</option>
              </select>
              <button className="secondary-btn" onClick={shareDocument} disabled={!isOwner || !currentDoc}>Share</button>
            </div>
          </div>
        </div>

        <div className={`feedback ${feedback.type}`}>{feedback.text}</div>

        <div className="toolbar">
          <button className={activeFormats.bold ? 'tool-btn active' : 'tool-btn'} onClick={() => quillRef.current?.getEditor().format('bold', !activeFormats.bold)}>Bold</button>
          <button className={activeFormats.italic ? 'tool-btn active' : 'tool-btn'} onClick={() => quillRef.current?.getEditor().format('italic', !activeFormats.italic)}>Italic</button>
          <button className={activeFormats.underline ? 'tool-btn active' : 'tool-btn'} onClick={() => quillRef.current?.getEditor().format('underline', !activeFormats.underline)}>Underline</button>
          <button className={activeFormats.header ? 'tool-btn active' : 'tool-btn'} onClick={() => quillRef.current?.getEditor().format('header', activeFormats.header ? false : 2)}>H2</button>
          <button className={activeFormats.list ? 'tool-btn active' : 'tool-btn'} onClick={() => quillRef.current?.getEditor().format('list', activeFormats.list ? false : 'bullet')}>Bullet</button>
        </div>

        <ReactQuill
          ref={quillRef}
          className="quill-editor"
          theme="snow"
          value={content}
          onChange={setContent}
          onChangeSelection={updateActiveFormats}
          modules={{ toolbar: toolbarOptions }}
          formats={['bold', 'italic', 'underline', 'header', 'list']}
          readOnly={!canEdit}
        />

        {/* sharing panel moved to header */}
      </main>
    </div>
  );
}

export default App;
