exports.Dashboard = async (req, res) => {
    

    res.render("admin/home");  
};

exports.plantOverview = async (req, res) => {
    

    res.render("admin/plants");  
};


exports.irrigationControll = async (req, res) => {
    

    res.render("admin/irrigation");  
};


exports.userManagement = async (req, res) => {
    

    res.render("admin/user-management");  
};


exports.reportsAnalytics = async (req, res) => {
    

    res.render("admin/reports");  
};