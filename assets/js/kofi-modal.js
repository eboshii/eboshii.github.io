/**
 * eboshii Ko-fi In-Page Tip Jar Modal
 * Opens an in-page modal embedding the Ko-fi donation widget without external redirect.
 */
(function () {
  function initKofiModal() {
    const tipBtn = document.getElementById('kofi-tip-btn');
    const modal = document.getElementById('kofi-modal');
    const closeBtn = document.getElementById('kofi-modal-close');
    const iframe = document.getElementById('kofi-embed-iframe');

    if (!tipBtn || !modal) return;

    function openModal() {
      if (iframe && !iframe.src && iframe.dataset.src) {
        iframe.src = iframe.dataset.src;
      }
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    tipBtn.addEventListener('click', e => {
      e.preventDefault();
      openModal();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', e => {
      if (e.target === modal) {
        closeModal();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeModal();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKofiModal);
  } else {
    initKofiModal();
  }
})();
