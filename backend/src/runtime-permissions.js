// Permissions endpoint consumed by the ERP shell.
// ADMIN gets the complete module set; other roles receive only their operational modules.

const permissionsByRole = {
  ADMIN: ['*'],
  MANAGEMENT: ['dashboard','procurement','site','hr','accounts','reports','settings'],
  PROCUREMENT: ['dashboard','procurement','reports'],
  SITE_STORE: ['dashboard','procurement','site','reports'],
  SITE_ENGINEER: ['dashboard','site','reports'],
  ACCOUNTS: ['dashboard','accounts','reports'],
  HR: ['dashboard','hr','reports']
};

app.get('/api/me/permissions', auth, companyScope, async (req, res) => {
  const roleName = String(req.user?.role || '').toUpperCase();
  res.json({
    role: roleName,
    permissions: permissionsByRole[roleName] || ['dashboard']
  });
});
