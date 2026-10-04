async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    const error = new Error('Máy chủ trả về dữ liệu không hợp lệ.');
    error.status = response.status;
    throw error;
  }

  if (!response.ok || payload.ok === false) {
    const message =
      typeof payload.error === 'string' ? payload.error : 'Không thể xử lý yêu cầu.';
    const error = new Error(message);
    error.status = response.status;
    error.data = payload.data;
    throw error;
  }

  return payload;
}

function renderNavigation() {
  const header = document.createElement('header');
  header.className = 'site-header';

  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Điều hướng chính');

  const brand = document.createElement('a');
  brand.className = 'site-brand';
  brand.href = '/';
  brand.textContent = 'Sport Booking';
  nav.append(brand);

  const links = document.createElement('div');
  links.className = 'site-nav-links';
  nav.append(links);
  header.append(nav);
  document.body.prepend(header);

  apiFetch('/api/auth/me')
    .then(({ data }) => {
      const user = data.user;
      const greeting = document.createElement('span');
      greeting.className = 'nav-user';
      greeting.textContent = user.fullName;
      links.append(greeting);

      if (user.role === 'staff' || user.role === 'admin') {
        const adminLink = document.createElement('a');
        adminLink.href = '/admin/dashboard.html';
        adminLink.textContent = 'Quản lý';
        links.append(adminLink);
      }

      const logoutButton = document.createElement('button');
      logoutButton.className = 'button button-link';
      logoutButton.type = 'button';
      logoutButton.textContent = 'Đăng xuất';
      const logoutMessage = document.createElement('span');
      logoutMessage.className = 'nav-message form-message-error';
      logoutMessage.setAttribute('role', 'status');
      logoutMessage.setAttribute('aria-live', 'polite');
      logoutButton.addEventListener('click', async () => {
        logoutButton.disabled = true;
        try {
          await apiFetch('/api/auth/logout', { method: 'POST' });
          window.location.assign('/login.html');
        } catch (error) {
          logoutMessage.textContent = error.message;
          logoutButton.disabled = false;
        }
      });
      links.append(logoutButton, logoutMessage);
    })
    .catch((error) => {
      if (error.status !== 401) {
        const status = document.createElement('span');
        status.className = 'form-message-error';
        status.textContent = 'Không tải được trạng thái đăng nhập.';
        links.append(status);
        return;
      }

      const loginLink = document.createElement('a');
      loginLink.href = '/login.html';
      loginLink.textContent = 'Đăng nhập';

      const registerLink = document.createElement('a');
      registerLink.href = '/register.html';
      registerLink.textContent = 'Đăng ký';

      links.append(loginLink, registerLink);
    });
}

function showFormMessage(element, message, isError = true) {
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError);
}

function initializeAuthForms() {
  const loginForm = document.querySelector('#login-form');
  const registerForm = document.querySelector('#register-form');

  if (loginForm) {
    const message = loginForm.querySelector('.form-message');
    const submitButton = loginForm.querySelector('[type="submit"]');
    loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = 'Đang đăng nhập...';
    const formData = new FormData(loginForm);

      try {
      const { data } = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: formData.get('email'),
            password: formData.get('password'),
          }),
        });
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      const safeRedirect = getSafeInternalRedirect(redirect);
      const destinations = {
        admin: '/admin/dashboard.html',
        staff: '/admin/bookings.html',
        customer: '/',
      };
      const roleDestination = destinations[data?.user?.role];
      if (!roleDestination) {
        throw new Error('Không xác định được vai trò tài khoản.');
      }
      const redirectIsAllowedForRole =
        data.user.role !== 'staff' ||
        !safeRedirect?.startsWith('/admin/') ||
        ['/admin/bookings.html', '/admin/blocked.html'].includes(
          safeRedirect.split(/[?#]/, 1)[0],
        );
      window.location.assign(
        safeRedirect && redirectIsAllowedForRole ? safeRedirect : roleDestination,
      );
    } catch (error) {
      showFormMessage(message, error.message);
      submitButton.disabled = false;
      submitButton.textContent = 'Đăng nhập';
      }
    });
  }

  if (registerForm) {
    const message = registerForm.querySelector('.form-message');
    const submitButton = registerForm.querySelector('[type="submit"]');
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      submitButton.disabled = true;
      submitButton.textContent = 'Đang đăng ký...';
      const formData = new FormData(registerForm);

      try {
        await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            fullName: formData.get('fullName'),
            email: formData.get('email'),
            password: formData.get('password'),
          }),
        });
        showFormMessage(message, 'Đăng ký thành công. Bạn có thể đăng nhập.', false);
        registerForm.reset();
      } catch (error) {
        showFormMessage(message, error.message);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Đăng ký';
      }
    });
  }
}

function getSafeInternalRedirect(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : null;
  } catch {
    return null;
  }
}

window.apiFetch = apiFetch;

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.hasAttribute('data-admin-navigation')) return;
  renderNavigation();
  initializeAuthForms();
});