const adminNavLinks = [
  { label: 'Thống kê', href: '/admin/dashboard.html', roles: ['admin'] },
  { label: 'Lượt đặt', href: '/admin/bookings.html', roles: ['admin', 'staff'] },
  { label: 'Khóa sân', href: '/admin/blocked.html', roles: ['admin', 'staff'] },
  { label: 'Sân & bảng giá', href: '/admin/fields.html', roles: ['admin'] },
];

function getCurrentAdminLocation() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function redirectToAdminLogin() {
  const redirect = encodeURIComponent(getCurrentAdminLocation());
  window.location.replace(`/login.html?redirect=${redirect}`);
}

window.redirectToAdminLogin = redirectToAdminLogin;

function createAdminLink(label, href, currentPath) {
  const link = document.createElement('a');
  link.className = 'admin-nav-link';
  link.href = href;
  link.textContent = label;
  if (href === currentPath) {
    link.classList.add('is-active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

async function initializeAdminNavigation() {
  try {
    const { data } = await apiFetch('/api/auth/me');
    const role = data?.user?.role;
    if (!['admin', 'staff'].includes(role)) {
      redirectToAdminLogin();
      return;
    }

    const currentPath = window.location.pathname;
    const pageLink = adminNavLinks.find((link) => link.href === currentPath);
    if (!pageLink || !pageLink.roles.includes(role)) {
      redirectToAdminLogin();
      return;
    }

    const header = document.createElement('header');
    header.className = 'admin-nav-header';
    const brand = document.createElement('a');
    brand.className = 'admin-nav-brand';
    brand.href = '/';
    brand.textContent = 'Sport Booking';

    const nav = document.createElement('nav');
    nav.className = 'admin-nav';
    nav.setAttribute('aria-label', 'Điều hướng quản trị');
    adminNavLinks
      .filter((link) => link.roles.includes(role))
      .forEach((link) => {
        nav.appendChild(createAdminLink(link.label, link.href, currentPath));
      });

    const actions = document.createElement('div');
    actions.className = 'admin-nav-actions';
    actions.appendChild(createAdminLink('Về trang chủ', '/', currentPath));

    const logoutButton = document.createElement('button');
    logoutButton.className = 'admin-nav-link admin-nav-logout';
    logoutButton.type = 'button';
    logoutButton.textContent = 'Đăng xuất';
    const message = document.createElement('span');
    message.className = 'admin-nav-message form-message-error';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      message.textContent = '';
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        window.location.assign('/login.html');
      } catch (error) {
        message.textContent = error.message;
        logoutButton.disabled = false;
      }
    });
    actions.append(logoutButton, message);
    header.append(brand, nav, actions);

    const main = document.querySelector('main');
    document.body.insertBefore(header, main || document.body.firstChild);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      redirectToAdminLogin();
      return;
    }

    const status = document.createElement('p');
    status.className = 'admin-nav-error form-message-error';
    status.setAttribute('role', 'alert');
    status.textContent = error.message;
    document.body.insertBefore(status, document.querySelector('main') || document.body.firstChild);
  }
}

document.addEventListener('DOMContentLoaded', initializeAdminNavigation);
