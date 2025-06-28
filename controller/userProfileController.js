const { firestore } = require('../config/firebase');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads');
        // Create uploads directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const userId = req.session.user?.uid;
        const fileExtension = path.extname(file.originalname);
        const fileName = `profile_${userId}_${Date.now()}${fileExtension}`;
        cb(null, fileName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Check file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and GIF images are allowed'), false);
        }
    }
}).single('profilePicture');

const userProfileController = {
    // Display user profile page
    getUserProfile: async (req, res) => {
        try {
            const userId = req.session.user?.uid;
            
            if (!userId) {
                req.flash('error', 'Please log in to view your profile.');
                return res.redirect('/login');
            }

            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                req.flash('error', 'User not found.');
                return res.redirect('/login');
            }

            const userData = userDoc.data();
            
            // Helper function to format date
            const formatDate = (dateField) => {
                if (!dateField) return 'N/A';
                
                if (dateField && typeof dateField.toDate === 'function') {
                    return dateField.toDate().toLocaleString();
                }
                
                if (dateField instanceof Date) {
                    return dateField.toLocaleString();
                }
                
                if (typeof dateField === 'string' || typeof dateField === 'number') {
                    try {
                        return new Date(dateField).toLocaleString();
                    } catch (e) {
                        return 'Invalid Date';
                    }
                }
                
                return 'N/A';
            };

            const user = {
                id: userDoc.id,
                name: userData.name || '',
                email: userData.email || '',
                contactNumber: userData.contactNumber || '',
                role: userData.Role || 'User',
                status: userData.Status || 'Active',
                isVerified: userData.isVerified || false,
                profilePicture: userData.profilePicture || '/assets/img/default-avatar.png',
                lastLogin: formatDate(userData.lastLogin)
            };

            res.render('user/profile', {
                user,
                title: 'My Profile',
                success: req.flash('success'),
                error: req.flash('error')
            });
        } catch (error) {
            console.error('Error fetching user profile:', error);
            req.flash('error', 'Failed to load profile. Please try again.');
            res.redirect('/user-dashboard');
        }
    },

    // Update user profile information
    updateProfile: async (req, res) => {
        try {
            const userId = req.session.user?.uid;
            const { name, contactNumber } = req.body;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            // Validate required fields
            if (!name || name.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Name is required'
                });
            }

            // Check if user exists
            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Update user data
            const updateData = {
                name: name.trim(),
                contactNumber: contactNumber ? contactNumber.trim() : '',
                updatedAt: new Date()
            };

            await firestore.collection('users').doc(userId).update(updateData);

            res.json({
                success: true,
                message: 'Profile updated successfully'
            });
        } catch (error) {
            console.error('Error updating profile:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update profile. Please try again.'
            });
        }
    },

    // Change user password
    changePassword: async (req, res) => {
        try {
            const userId = req.session.user?.uid;
            const { currentPassword, newPassword, confirmPassword } = req.body;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            // Validate required fields
            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'All password fields are required'
                });
            }

            // Check if new password matches confirmation
            if (newPassword !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'New password and confirmation do not match'
                });
            }

            // Validate new password strength
            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'New password must be at least 6 characters long'
                });
            }

            // Get user data
            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const userData = userDoc.data();

            // Verify current password
            const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userData.password);
            
            if (!isCurrentPasswordValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Hash new password
            const saltRounds = 10;
            const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

            // Update password
            await firestore.collection('users').doc(userId).update({
                password: hashedNewPassword,
                lastPasswordUpdate: new Date(),
                updatedAt: new Date()
            });

            res.json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            console.error('Error changing password:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to change password. Please try again.'
            });
        }
    },

    // Upload profile picture
    uploadProfilePicture: async (req, res) => {
        upload(req, res, async function (err) {
            try {
                const userId = req.session.user?.uid;
                
                if (!userId) {
                    return res.status(401).json({
                        success: false,
                        message: 'User not authenticated'
                    });
                }

                if (err) {
                    return res.status(400).json({
                        success: false,
                        message: err.message
                    });
                }

                // Check if file was uploaded
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        message: 'No file uploaded'
                    });
                }

                // Update user profile picture
                const profilePictureUrl = `/uploads/${req.file.filename}`;
                await firestore.collection('users').doc(userId).update({
                    profilePicture: profilePictureUrl,
                    updatedAt: new Date()
                });

                res.json({
                    success: true,
                    message: 'Profile picture updated successfully',
                    profilePicture: profilePictureUrl
                });
            } catch (error) {
                console.error('Error uploading profile picture:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to upload profile picture. Please try again.'
                });
            }
        });
    }
};

module.exports = userProfileController; 