const { firestore } = require('../config/firebase');

const userManagementController = {
    // Display user management page with pagination and search
    userManagement: async (req, res) => {
        try {
            // Get user data from session
            const userId = req.session.user?.uid;
            let userData = null;
            
            if (userId) {
                try {
                    const userDoc = await firestore.collection('users').doc(userId).get();
                    if (userDoc.exists) {
                        userData = userDoc.data();
                        userData.id = userDoc.id;
                        // Set default profile picture if none exists
                        userData.profilePicture = userData.profilePicture || '/assets/img/default-avatar.png';
                    }
                } catch (error) {
                    console.error('Error fetching user data:', error);
                }
            }

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const searchQuery = req.query.search || '';
            const roleFilter = req.query.role || '';
            const verificationFilter = req.query.verified || '';
            const statusFilter = req.query.status || '';

            let usersQuery = firestore.collection('users');

            // Apply filters
            if (searchQuery) {
                usersQuery = usersQuery.where('name', '>=', searchQuery)
                    .where('name', '<=', searchQuery + '\uf8ff');
            }
            if (roleFilter) {
                usersQuery = usersQuery.where('Role', '==', roleFilter);
            }
            if (verificationFilter !== '') {
                usersQuery = usersQuery.where('isVerified', '==', verificationFilter === 'true');
            }
            if (statusFilter) {
                usersQuery = usersQuery.where('Status', '==', statusFilter);
            }

            // Get total count for pagination
            const totalSnapshot = await usersQuery.count().get();
            const total = totalSnapshot.data().count;

            // Apply pagination
            const startAfter = (page - 1) * limit;
            const usersSnapshot = await usersQuery
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .offset(startAfter)
                .get();

            const users = [];
            
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                
                // Skip users with invalid status
                if (userData.Status && userData.Status !== 'Active' && userData.Status !== 'Deactivated') {
                    return;
                }
                
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

                users.push({
                    id: doc.id,
                    name: userData.name || 'N/A',
                    email: userData.email || 'N/A',
                    role: userData.Role || 'User',
                    isVerified: userData.isVerified || false,
                    status: userData.Status || 'Deactivated',
                    contactNumber: userData.contactNumber || 'N/A',
                    createdAt: formatDate(userData.createdAt),
                    lastPasswordUpdate: formatDate(userData.lastPasswordUpdate),
                    lastLogin: formatDate(userData.lastLogin),
                    profilePicture: userData.profilePicture || '/assets/img/default-avatar.png'
                });
            });

            // Calculate pagination info
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            res.render('admin/user-management', {
                user: userData || {
                    name: 'Admin',
                    role: 'Admin',
                    profilePicture: '/assets/img/default-avatar.png'
                },
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                },
                filters: {
                    search: searchQuery,
                    role: roleFilter,
                    verified: verificationFilter,
                    status: statusFilter
                },
                title: 'User Management'
            });
        } catch (error) {
            console.error('Error fetching users:', error);
            req.flash('error', 'Failed to fetch user data. Please try again.');
            res.redirect('/admin-user-management');
        }
    },

    // Update user role
    updateUserRole: async (req, res) => {
        try {
            const { userId } = req.params;
            const { role } = req.body;

            if (!userId || !role) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'User ID and role are required' 
                });
            }

            // Validate role
            const validRoles = ['User', 'Admin'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role specified'
                });
            }

            await firestore.collection('users').doc(userId).update({
                Role: role,
                updatedAt: new Date()
            });

            res.json({ 
                success: true, 
                message: 'User role updated successfully' 
            });
        } catch (error) {
            console.error('Error updating user role:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to update user role. Please try again.' 
            });
        }
    },

    // Toggle user verification
    toggleUserVerification: async (req, res) => {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'User ID is required' 
                });
            }

            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

            const currentStatus = userDoc.data().isVerified;

            await firestore.collection('users').doc(userId).update({
                isVerified: !currentStatus,
                updatedAt: new Date()
            });

            res.json({ 
                success: true, 
                message: `User ${!currentStatus ? 'verified' : 'unverified'} successfully` 
            });
        } catch (error) {
            console.error('Error toggling user verification:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to update verification status. Please try again.' 
            });
        }
    },

    // Toggle user status (Activate/Deactivate)
    toggleUserStatus: async (req, res) => {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'User ID is required' 
                });
            }

            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

            const currentStatus = userDoc.data().Status;
            const newStatus = currentStatus === 'Active' ? 'Deactivated' : 'Active';

            await firestore.collection('users').doc(userId).update({
                Status: newStatus,
                updatedAt: new Date()
            });

            res.json({ 
                success: true, 
                message: `User ${newStatus.toLowerCase()} successfully` 
            });
        } catch (error) {
            console.error('Error toggling user status:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to update user status. Please try again.' 
            });
        }
    },

    // Delete user
    deleteUser: async (req, res) => {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'User ID is required' 
                });
            }

            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

            await firestore.collection('users').doc(userId).delete();

            res.json({ 
                success: true, 
                message: 'User deleted successfully' 
            });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to delete user. Please try again.' 
            });
        }
    },

    // Get user details
    getUserDetails: async (req, res) => {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'User ID is required' 
                });
            }

            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

            const userData = userDoc.data();
            
            res.json({ 
                success: true, 
                user: {
                    id: userDoc.id,
                    ...userData
                }
            });
        } catch (error) {
            console.error('Error fetching user details:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch user details. Please try again.' 
            });
        }
    },

    // Get pending users count
    getPendingUsersCount: async (req, res) => {
        try {
            const pendingUsersSnapshot = await firestore.collection('users')
                .where('Status', '==', 'Pending')
                .count()
                .get();

            res.json({
                success: true,
                count: pendingUsersSnapshot.data().count
            });
        } catch (error) {
            console.error('Error getting pending users count:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get pending users count'
            });
        }
    },

    // Get pending users
    getPendingUsers: async (req, res) => {
        try {
            console.log('Fetching pending users...');
            
            // First, let's check if there are any users with Pending status
            const pendingUsersSnapshot = await firestore.collection('users')
                .where('Status', '==', 'Pending')
                .get();

            console.log(`Found ${pendingUsersSnapshot.size} pending users`);

            const users = [];
            pendingUsersSnapshot.forEach(doc => {
                const userData = doc.data();
                console.log('User data:', { id: doc.id, status: userData.Status, name: userData.name });
                
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

                users.push({
                    id: doc.id,
                    name: userData.name || 'N/A',
                    email: userData.email || 'N/A',
                    contactNumber: userData.contactNumber || 'N/A',
                    createdAt: formatDate(userData.createdAt),
                    profilePicture: userData.profilePicture || '/assets/img/default-avatar.png',
                    role: userData.Role || 'User',
                    isVerified: userData.isVerified || false
                });
            });

            console.log('Processed users:', users);

            res.json({
                success: true,
                users
            });
        } catch (error) {
            console.error('Error getting pending users:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get pending users: ' + error.message
            });
        }
    },

    // Approve user
    approveUser: async (req, res) => {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            await firestore.collection('users').doc(userId).update({
                Status: 'Active',
                updatedAt: new Date()
            });

            res.json({
                success: true,
                message: 'User approved successfully'
            });
        } catch (error) {
            console.error('Error approving user:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to approve user'
            });
        }
    },

    // Reject user
    rejectUser: async (req, res) => {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            await firestore.collection('users').doc(userId).update({
                Status: 'Deactivated',
                updatedAt: new Date()
            });

            res.json({
                success: true,
                message: 'User rejected successfully'
            });
        } catch (error) {
            console.error('Error rejecting user:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reject user'
            });
        }
    },

    // Test function to check if route is working
    testPendingUsers: async (req, res) => {
        try {
            console.log('Test function called');
            res.json({
                success: true,
                message: 'Test function working',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Test function error:', error);
            res.status(500).json({
                success: false,
                message: 'Test function failed'
            });
        }
    },

    // Update user
    updateUser: async (req, res) => {
        try {
            const { userId } = req.params;
            const { name, email, contactNumber, Role, Status, isVerified } = req.body;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'User ID is required' 
                });
            }

            const userDoc = await firestore.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

            // Validate required fields
            if (!name || !email) {
                return res.status(400).json({
                    success: false,
                    message: 'Name and email are required'
                });
            }

            // Validate role
            const validRoles = ['User', 'Admin'];
            if (Role && !validRoles.includes(Role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role specified'
                });
            }

            // Validate status
            const validStatuses = ['Active', 'Deactivated'];
            if (Status && !validStatuses.includes(Status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status specified'
                });
            }

            const updateData = {
                name,
                email,
                contactNumber: contactNumber || '',
                Role: Role || 'User',
                Status: Status || 'Deactivated',
                isVerified: isVerified || false,
                updatedAt: new Date()
            };

            await firestore.collection('users').doc(userId).update(updateData);

            res.json({ 
                success: true, 
                message: 'User updated successfully' 
            });
        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to update user. Please try again.' 
            });
        }
    }
};

module.exports = userManagementController; 