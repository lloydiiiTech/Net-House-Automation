const { firestore } = require('../config/firebase');

exports.Dashboard = async (req, res) => {
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

    res.render("home", {
        user: userData || {
            name: 'User',
            role: 'User',
            profilePicture: '/assets/img/default-avatar.png'
        }
    });  
};

exports.plantOverview = async (req, res) => {
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

    res.render("plants", {
        user: userData || {
            name: 'User',
            role: 'User',
            profilePicture: '/assets/img/default-avatar.png'
        }
    });  
};


exports.irrigationControll = async (req, res) => {
    

    res.render("irrigation", {
       
    });  
};


exports.userManagement = async (req, res) => {
    

    res.render("user-management", {
       
    });  
};


exports.reportsAnalytics = async (req, res) => {
    

    res.render("home", {
       
    });  
};

exports.profile = async (req, res) => {
    

    res.render("profile", {
       
    });  
};