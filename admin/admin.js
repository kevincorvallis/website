// ============================================
// Admin Panel JavaScript
// ============================================

// Get config from parent window or global
const config = window.portfolioConfig || {};

// State
let currentUser = null;
let photos = [];
let editingPhoto = null;
let sortableInstance = null;

// DOM Elements
const loginContainer = document.getElementById('loginContainer');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const uploadProgressList = document.getElementById('uploadProgressList');
const photosGrid = document.getElementById('photosGrid');
const sectionFilter = document.getElementById('sectionFilter');
const categoryFilter = document.getElementById('categoryFilter');
const defaultSection = document.getElementById('defaultSection');
const defaultCategory = document.getElementById('defaultCategory');
const editModal = document.getElementById('editModal');
const deleteModal = document.getElementById('deleteModal');
const toastContainer = document.getElementById('toastContainer');

// Stats
const totalPhotosEl = document.getElementById('totalPhotos');
const galleryPhotosEl = document.getElementById('galleryPhotos');
const bentoPhotosEl = document.getElementById('bentoPhotos');
const featuredPhotosEl = document.getElementById('featuredPhotos');

// ============================================
// Initialize Supabase
// ============================================
let supabase = null;

function initializeSupabase() {
    if (window.supabase && config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
        supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
        return true;
    }
    return false;
}

// ============================================
// Authentication
// ============================================
async function checkSession() {
    if (!supabase) return false;

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
            currentUser = session.user;
            showDashboard();
            loadPhotos();
            return true;
        }
    } catch (error) {
        console.error('Session check error:', error);
    }

    showLogin();
    return false;
}

async function login(email, password) {
    if (!supabase) {
        showError('Supabase not configured. Please check config.js');
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        currentUser = data.user;
        showDashboard();
        loadPhotos();
        showToast('Welcome back!', 'success');
    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Login failed. Please check your credentials.');
    }
}

async function logout() {
    if (!supabase) return;

    try {
        await supabase.auth.signOut();
        currentUser = null;
        photos = [];
        showLogin();
        showToast('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function showLogin() {
    loginContainer.style.display = 'flex';
    dashboard.classList.remove('active');
}

function showDashboard() {
    loginContainer.style.display = 'none';
    dashboard.classList.add('active');
    if (currentUser) {
        userEmail.textContent = currentUser.email;
    }
}

function showError(message) {
    loginError.textContent = message;
    loginError.classList.add('show');
    setTimeout(() => loginError.classList.remove('show'), 5000);
}

// ============================================
// Photo CRUD Operations
// ============================================
async function loadPhotos() {
    if (!supabase) return;

    try {
        const { data, error } = await supabase
            .from('photos')
            .select('*')
            .order('section')
            .order('display_order');

        if (error) throw error;

        photos = data || [];
        updateStats();
        renderPhotos();
    } catch (error) {
        console.error('Load photos error:', error);
        showToast('Failed to load photos', 'error');
    }
}

async function savePhoto(photoData) {
    if (!supabase) return null;

    try {
        const { data, error } = await supabase
            .from('photos')
            .insert([photoData])
            .select()
            .single();

        if (error) throw error;

        photos.push(data);
        updateStats();
        renderPhotos();
        showToast('Photo saved successfully', 'success');
        return data;
    } catch (error) {
        console.error('Save photo error:', error);
        showToast('Failed to save photo', 'error');
        return null;
    }
}

async function updatePhoto(id, updates) {
    if (!supabase) return false;

    try {
        const { data, error } = await supabase
            .from('photos')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        const index = photos.findIndex(p => p.id === id);
        if (index !== -1) {
            photos[index] = data;
        }

        updateStats();
        renderPhotos();
        showToast('Photo updated successfully', 'success');
        return true;
    } catch (error) {
        console.error('Update photo error:', error);
        showToast('Failed to update photo', 'error');
        return false;
    }
}

async function deletePhoto(id) {
    if (!supabase) return false;

    const photo = photos.find(p => p.id === id);
    if (!photo) return false;

    try {
        // Delete from Supabase
        const { error } = await supabase
            .from('photos')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Optionally delete from Cloudinary (requires server-side endpoint)
        // For now, just remove from local state

        photos = photos.filter(p => p.id !== id);
        updateStats();
        renderPhotos();
        showToast('Photo deleted successfully', 'success');
        return true;
    } catch (error) {
        console.error('Delete photo error:', error);
        showToast('Failed to delete photo', 'error');
        return false;
    }
}

async function reorderPhotos(section, orderedIds) {
    if (!supabase) return false;

    try {
        // Update display_order for each photo
        const updates = orderedIds.map((id, index) => ({
            id,
            display_order: index,
            updated_at: new Date().toISOString()
        }));

        for (const update of updates) {
            await supabase
                .from('photos')
                .update({ display_order: update.display_order, updated_at: update.updated_at })
                .eq('id', update.id);
        }

        // Refresh photos
        await loadPhotos();
        showToast('Order updated', 'success');
        return true;
    } catch (error) {
        console.error('Reorder error:', error);
        showToast('Failed to update order', 'error');
        return false;
    }
}

// ============================================
// Cloudinary Upload
// ============================================
async function uploadToCloudinary(file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', config.CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'portfolio');

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
                const percent = Math.round((e.loaded / e.total) * 100);
                onProgress(percent);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                resolve({
                    public_id: response.public_id,
                    url: response.secure_url,
                    width: response.width,
                    height: response.height,
                    format: response.format,
                    size_bytes: response.bytes
                });
            } else {
                reject(new Error('Upload failed'));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload failed')));

        xhr.open('POST', `https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/image/upload`);
        xhr.send(formData);
    });
}

async function handleFileUpload(files) {
    const validFiles = Array.from(files).filter(file => {
        if (!file.type.startsWith('image/')) {
            showToast(`${file.name} is not an image`, 'error');
            return false;
        }
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            showToast(`${file.name} is too large (max 10MB)`, 'error');
            return false;
        }
        return true;
    });

    if (validFiles.length === 0) return;

    uploadProgress.classList.add('active');
    uploadProgressList.innerHTML = '';

    const section = defaultSection.value;
    const category = defaultCategory.value;

    for (const file of validFiles) {
        const itemEl = createProgressItem(file.name);
        uploadProgressList.appendChild(itemEl);

        try {
            // Upload to Cloudinary
            const cloudinaryData = await uploadToCloudinary(file, (percent) => {
                updateProgressItem(itemEl, percent);
            });

            // Save metadata to Supabase
            const photoData = {
                cloudinary_id: cloudinaryData.public_id,
                cloudinary_url: cloudinaryData.url,
                title: file.name.replace(/\.[^/.]+$/, ''),
                alt_text: '',
                category: category,
                section: section,
                display_order: photos.filter(p => p.section === section).length,
                featured: false,
                width: cloudinaryData.width,
                height: cloudinaryData.height,
                format: cloudinaryData.format,
                size_bytes: cloudinaryData.size_bytes
            };

            await savePhoto(photoData);
            completeProgressItem(itemEl, true);
        } catch (error) {
            console.error('Upload error:', error);
            completeProgressItem(itemEl, false, error.message);
        }
    }

    // Hide progress after a delay
    setTimeout(() => {
        uploadProgress.classList.remove('active');
    }, 3000);
}

function createProgressItem(filename) {
    const div = document.createElement('div');
    div.className = 'upload-progress-item';
    div.innerHTML = `
        <span class="upload-progress-item-name">${filename}</span>
        <div class="upload-progress-bar">
            <div class="upload-progress-bar-fill" style="width: 0%"></div>
        </div>
        <span class="upload-progress-item-status">0%</span>
    `;
    return div;
}

function updateProgressItem(itemEl, percent) {
    const fill = itemEl.querySelector('.upload-progress-bar-fill');
    const status = itemEl.querySelector('.upload-progress-item-status');
    fill.style.width = `${percent}%`;
    status.textContent = `${percent}%`;
}

function completeProgressItem(itemEl, success, errorMsg) {
    const status = itemEl.querySelector('.upload-progress-item-status');
    const fill = itemEl.querySelector('.upload-progress-bar-fill');

    if (success) {
        fill.style.width = '100%';
        fill.style.background = 'var(--admin-success)';
        status.textContent = '✓';
        status.className = 'upload-progress-item-status success';
    } else {
        fill.style.background = 'var(--admin-error)';
        status.textContent = errorMsg || 'Failed';
        status.className = 'upload-progress-item-status error';
    }
}

// ============================================
// UI Rendering
// ============================================
function updateStats() {
    totalPhotosEl.textContent = photos.length;
    galleryPhotosEl.textContent = photos.filter(p => p.section === 'gallery').length;
    bentoPhotosEl.textContent = photos.filter(p => p.section === 'bento').length;
    featuredPhotosEl.textContent = photos.filter(p => p.featured).length;
}

function renderPhotos() {
    const sectionValue = sectionFilter.value;
    const categoryValue = categoryFilter.value;

    let filtered = [...photos];

    if (sectionValue) {
        filtered = filtered.filter(p => p.section === sectionValue);
    }

    if (categoryValue) {
        filtered = filtered.filter(p => p.category === categoryValue);
    }

    // Sort by section then display_order
    filtered.sort((a, b) => {
        if (a.section !== b.section) return a.section.localeCompare(b.section);
        return a.display_order - b.display_order;
    });

    if (filtered.length === 0) {
        photosGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon">📷</div>
                <p class="empty-state-text">No photos yet</p>
                <p class="empty-state-hint">Upload some photos to get started</p>
            </div>
        `;
        return;
    }

    photosGrid.innerHTML = filtered.map(photo => createPhotoCard(photo)).join('');

    // Initialize sortable if filtering by section
    initSortable();
}

function createPhotoCard(photo) {
    const thumbnailUrl = config.getCloudinaryUrl
        ? config.getCloudinaryUrl(photo.cloudinary_id, { width: 400, height: 300, crop: 'fill' })
        : photo.cloudinary_url;

    return `
        <div class="photo-card" data-id="${photo.id}" data-section="${photo.section}">
            <div class="photo-card-image">
                <img src="${thumbnailUrl}" alt="${photo.alt_text || photo.title}" loading="lazy">
                <div class="photo-card-overlay">
                    <div class="photo-card-actions">
                        <button class="btn btn-secondary btn-small" onclick="openEditModal('${photo.id}')">
                            Edit
                        </button>
                        <button class="btn btn-danger btn-small" onclick="openDeleteModal('${photo.id}')">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
            <div class="photo-card-content">
                <h3 class="photo-card-title">${photo.title || 'Untitled'}</h3>
                <div class="photo-card-meta">
                    <span class="photo-card-badge">${photo.section}</span>
                    ${photo.category ? `<span class="photo-card-badge">${photo.category}</span>` : ''}
                    ${photo.featured ? `<span class="photo-card-badge featured">Featured</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

function initSortable() {
    if (sortableInstance) {
        sortableInstance.destroy();
    }

    if (typeof Sortable !== 'undefined' && sectionFilter.value) {
        sortableInstance = new Sortable(photosGrid, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            onEnd: async function(evt) {
                const section = sectionFilter.value;
                const items = photosGrid.querySelectorAll('.photo-card');
                const orderedIds = Array.from(items).map(item => item.dataset.id);
                await reorderPhotos(section, orderedIds);
            }
        });
    }
}

// ============================================
// Modals
// ============================================
function openEditModal(photoId) {
    editingPhoto = photos.find(p => p.id === photoId);
    if (!editingPhoto) return;

    const previewUrl = config.getCloudinaryUrl
        ? config.getCloudinaryUrl(editingPhoto.cloudinary_id, { width: 800 })
        : editingPhoto.cloudinary_url;

    document.getElementById('editPreview').src = previewUrl;
    document.getElementById('editTitle').value = editingPhoto.title || '';
    document.getElementById('editAltText').value = editingPhoto.alt_text || '';
    document.getElementById('editSection').value = editingPhoto.section || 'gallery';
    document.getElementById('editCategory').value = editingPhoto.category || '';
    document.getElementById('editFeatured').checked = editingPhoto.featured || false;

    editModal.classList.add('active');
}

function closeEditModal() {
    editModal.classList.remove('active');
    editingPhoto = null;
}

async function saveEditModal() {
    if (!editingPhoto) return;

    const updates = {
        title: document.getElementById('editTitle').value,
        alt_text: document.getElementById('editAltText').value,
        section: document.getElementById('editSection').value,
        category: document.getElementById('editCategory').value,
        featured: document.getElementById('editFeatured').checked
    };

    const success = await updatePhoto(editingPhoto.id, updates);
    if (success) {
        closeEditModal();
    }
}

let deletingPhotoId = null;

function openDeleteModal(photoId) {
    deletingPhotoId = photoId;
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    document.getElementById('deletePhotoName').textContent = photo.title || 'this photo';
    deleteModal.classList.add('active');
}

function closeDeleteModal() {
    deleteModal.classList.remove('active');
    deletingPhotoId = null;
}

async function confirmDelete() {
    if (!deletingPhotoId) return;

    const success = await deletePhoto(deletingPhotoId);
    if (success) {
        closeDeleteModal();
    }
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// Event Listeners
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Supabase
    if (!initializeSupabase()) {
        console.warn('Supabase not configured. Please update js/config.js with your credentials.');
    }

    // Check for existing session
    checkSession();

    // Login form
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        await login(email, password);
    });

    // Logout
    logoutBtn?.addEventListener('click', logout);

    // Upload zone
    uploadZone?.addEventListener('click', () => fileInput?.click());

    uploadZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone?.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        handleFileUpload(e.dataTransfer.files);
    });

    fileInput?.addEventListener('change', (e) => {
        handleFileUpload(e.target.files);
        e.target.value = ''; // Reset
    });

    // Filters
    sectionFilter?.addEventListener('change', renderPhotos);
    categoryFilter?.addEventListener('change', renderPhotos);

    // Modal close on overlay click
    editModal?.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });

    deleteModal?.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeEditModal();
            closeDeleteModal();
        }
    });
});

// Make functions available globally
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEditModal = saveEditModal;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
