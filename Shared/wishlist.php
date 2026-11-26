<?php
/**
 * wishlist.php — PARTIAL INCLUDE
 * Self-Contained Fully Styled & Dynamic Wishlist Drawer Component
 * DT Brand's & Jai Hanuman Tex
 */
require_once __DIR__ . '/../src/ProductCatalog.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Auth.php';

use DTBrand\ProductCatalog;
use DTBrand\Auth;

Auth::initSession();
$wishlistCurrentUser = Auth::getCurrentUser();
$wishlistRole = 'guest';
if (Auth::isAdminLoggedIn()) {
    $wishlistRole = 'admin';
} elseif ($wishlistCurrentUser) {
    $wishlistRole = strtolower(trim((string)($wishlistCurrentUser['type'] ?? ($wishlistCurrentUser['role'] ?? 'customer'))));
}
if ($wishlistRole === 'wholesaler') { $wishlistRole = 'wholesale'; }
if ($wishlistRole === '' || $wishlistRole === 'retail') { $wishlistRole = 'customer'; }

if (empty($GLOBALS['dt_all_products_bootstrapped'])) {
    $dbProductsForWishlist = ProductCatalog::getForRole($wishlistRole);
    $GLOBALS['dt_all_products_bootstrapped'] = true;
    ?>
<script>
if (!window.allProducts || !window.allProducts.length) {
    window.allProducts = <?php echo json_encode($dbProductsForWishlist); ?>;
}
</script>
<?php } ?>
<style>
/* ── Wishlist Drawer Base Styles ── */
.wishlist-drawer-backdrop {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(24, 20, 16, 0.78); backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: flex-end;
    z-index: 999999 !important; opacity: 0; visibility: hidden;
    pointer-events: none;
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.wishlist-drawer-backdrop.active { opacity: 1; visibility: visible; pointer-events: auto; }

.wishlist-drawer-content {
    background: linear-gradient(180deg, #FFFFFF 0%, #FAF6EE 100%);
    width: 100%; max-width: 440px; height: 100%;
    box-shadow: -10px 0 30px rgba(0,0,0,0.25);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    border-left: 3px solid var(--dark-gold, #8A681F);
}
.wishlist-drawer-backdrop.active .wishlist-drawer-content {
    transform: translateX(0);
}

.wd-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; height: 56px; border-bottom: 1.5px solid rgba(138,104,31,0.35); background: linear-gradient(180deg, #FFFFFF 0%, #FAF6EE 100%); flex-shrink: 0; }
.wd-title { font-family: var(--font-serif, 'Cinzel', serif); font-size: 1.02rem; color: var(--dark-gold, #8A681F); font-weight: 700; margin: 0; line-height: 1.1; }
.wd-subtitle { font-size: 0.6rem; color: var(--mid-text, #5A5348); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-top: 2px; }
.wd-close-btn { width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(138,104,31,0.25); background: #FFFFFF; font-size: 1.2rem; color: var(--dark-gold, #8A681F); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; line-height: 1; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
.wd-close-btn:hover { color: #FFFFFF; background: var(--dark-gold, #8A681F); border-color: var(--dark-gold, #8A681F); transform: rotate(90deg); }

.wd-body { padding: 14px 16px 20px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }

.wd-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: #FFFFFF; border: 1px solid rgba(138,104,31,0.2); border-radius: 10px; }
.wd-toolbar-count { font-size: 0.72rem; font-weight: 700; color: #5A5348; }
.wd-toolbar-actions { display: flex; align-items: center; gap: 8px; }
.wd-move-all-btn { padding: 5px 11px; border-radius: 999px; background: linear-gradient(135deg, #B8860B 0%, #D4AF37 100%); color: #111827; border: 1px solid #8A681F; font-size: 0.66rem; font-weight: 800; cursor: pointer; }
.wd-clear-btn { padding: 5px 10px; border-radius: 999px; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; font-size: 0.66rem; font-weight: 700; cursor: pointer; }

.wd-quick-cats { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 14px; }
.wd-quick-chip { padding: 5px 11px; border-radius: 999px; background: #FFFFFF; border: 1px solid rgba(138,104,31,0.26); color: #6F5218; font-size: 0.66rem; font-weight: 700; text-decoration: none; transition: all 0.2s ease; }
.wd-quick-chip:hover { background: #FAF3E0; border-color: #8A681F; color: #1C1917; }

.wd-atelier-foot { margin-top: auto; padding: 12px; background: rgba(255,255,255,0.85); border: 1px solid rgba(138,104,31,0.18); border-radius: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; width: 100%; box-sizing: border-box; }
.wd-atelier-pill { font-size: 0.6rem; font-weight: 700; color: #5A5348; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.wd-atelier-pill strong { color: #8A681F; font-size: 0.64rem; }

/* ── Wishlist Item Card ── */
.wd-item { display: flex; gap: 14px; background: #FFFFFF; padding: 12px; border-radius: 12px; border: 1.5px solid rgba(138,104,31,0.2); align-items: center; transition: all 0.25s ease; }
.wd-item:hover { box-shadow: 0 4px 16px rgba(138,104,31,0.12); border-color: var(--dark-gold, #8A681F); }
.wd-item-img { width: 78px; height: 104px; aspect-ratio: 3 / 4; object-fit: cover; object-position: top center; border-radius: 8px; border: 1.5px solid rgba(138,104,31,0.25); flex-shrink: 0; background: #F8F5EE; }
.wd-item-info { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.wd-item-title { font-family: var(--font-serif, 'Cinzel', serif); font-size: 0.92rem; font-weight: 700; color: var(--dark-text, #24211C); margin: 0; }
.wd-item-meta { font-size: 0.7rem; color: var(--mid-text, #5A5348); font-weight: 500; }
.wd-item-price { font-size: 0.95rem; font-weight: 800; color: var(--dark-gold, #8A681F); }
.wd-item-old { font-size: 0.75rem; color: var(--light-text, #9A9490); text-decoration: line-through; margin-left: 4px; }

.wd-actions { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.wd-move-bag-btn { padding: 7px 14px; border-radius: 6px; background: var(--dark-gold, #8A681F); color: #FFF; border: none; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; cursor: pointer; transition: all 0.2s; }
.wd-move-bag-btn:hover { background: var(--deep-gold, #6F5218); box-shadow: 0 2px 8px rgba(138,104,31,0.3); }
.wd-remove-btn { border: none; background: none; color: #E53935; font-size: 0.72rem; font-weight: 600; cursor: pointer; margin-left: auto; transition: opacity 0.2s; }
.wd-remove-btn:hover { text-decoration: underline; opacity: 0.8; }

/* ── Animated Empty Wishlist Styles ── */
.wd-empty-container {
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding: 18px 4px 4px; text-align: center; width: 100%; flex: 1;
}
.wd-empty-icon-wrap {
    position: relative; width: 96px; height: 96px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 12px;
}
.wd-empty-glow-ring {
    position: absolute; inset: -10px; border-radius: 50%;
    background: radial-gradient(circle, rgba(229,57,53,0.18) 0%, rgba(229,57,53,0) 70%);
    animation: pulseHeartRing 3s ease-in-out infinite;
}
@keyframes pulseHeartRing {
    0%, 100% { transform: scale(0.9); opacity: 0.4; }
    50% { transform: scale(1.2); opacity: 1; }
}

.wd-empty-svg {
    width: 68px; height: 68px;
    stroke: #E53935; fill: none; stroke-width: 1.6;
    animation: floatHeart 3.6s ease-in-out infinite;
    filter: drop-shadow(0 8px 16px rgba(229,57,53,0.25));
    position: relative; z-index: 2;
}
@keyframes floatHeart {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-10px) scale(1.08); }
}

.wd-empty-title {
    font-family: var(--font-serif, 'Cinzel', serif);
    font-size: 1.2rem; font-weight: 700; color: var(--dark-gold, #8A681F);
    letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 4px;
}
.wd-empty-desc {
    font-size: 0.78rem; color: var(--mid-text, #5A5348);
    margin: 0 0 16px; line-height: 1.5; max-width: 270px;
}

.wd-explore-btn {
    padding: 10px 22px; border-radius: 24px;
    background: linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #E6CA65 100%);
    border: 1px solid #8A681F;
    color: #111827; font-size: 0.72rem; font-weight: 800;
    letter-spacing: 0.12em; text-transform: uppercase; border: none; cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 3px 12px rgba(184,134,11,0.3); transition: all 0.22s ease;
    display: inline-flex; align-items: center; gap: 8px;
}
.wd-explore-btn:hover {
    background: linear-gradient(135deg, #C59312 0%, #DFC04E 50%, #F0D77B 100%);
    transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 5px 16px rgba(184,134,11,0.42);
}

/* ── Interactive Auto-Slide Product Recommendations with Full-Size Portrait Photo ── */
.wd-recommend-section {
    margin-top: 18px; padding-top: 16px;
    border-top: 1px dashed rgba(138,104,31,0.3);
    width: 100%; text-align: left;
}
.wd-rec-head {
    font-family: var(--font-serif, 'Cinzel', serif); font-size: 0.78rem; font-weight: 700;
    color: var(--dark-gold, #8A681F); letter-spacing: 0.1em; text-transform: uppercase;
    margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;
}
.wd-rec-track {
    display: flex; gap: 12px; overflow-x: auto;
    padding: 6px 4px 12px; scrollbar-width: none; -webkit-overflow-scrolling: touch;
    scroll-padding-left: 4px;
    cursor: grab; user-select: none; scroll-behavior: auto;
}
.wd-rec-track.active-drag {
    cursor: grabbing; cursor: -webkit-grabbing;
}
.wd-rec-track::-webkit-scrollbar { display: none; }

.wd-rec-card {
    flex: 0 0 148px !important;
    width: 148px !important;
    min-width: 148px !important;
    max-width: 148px !important;
    height: 245px !important;
    min-height: 245px !important;
    max-height: 245px !important;
    background: #FFFFFF !important;
    border: 1.5px solid rgba(138,104,31,0.22) !important;
    border-radius: 12px !important;
    padding: 8px !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: space-between !important;
    transition: all 0.25s ease !important;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05) !important;
    position: relative !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
}
.wd-rec-card:hover { border-color: var(--dark-gold, #8A681F) !important; box-shadow: 0 6px 18px rgba(138,104,31,0.2) !important; transform: translateY(-2px) !important; }

.wd-rec-img-wrap {
    width: 100% !important;
    height: 155px !important;
    min-height: 155px !important;
    max-height: 155px !important;
    border-radius: 8px !important;
    overflow: hidden !important;
    background: #F8F5EE !important;
    position: relative !important;
    flex-shrink: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
}
.wd-rec-img {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    max-height: 100% !important;
    object-fit: cover !important;
    object-position: top center !important;
    display: block !important;
    pointer-events: none !important;
    transition: transform 0.35s ease !important;
}
.wd-rec-card:hover .wd-rec-img { transform: scale(1.05) !important; }

.wd-rec-title {
    font-size: 0.72rem !important;
    font-weight: 700 !important;
    color: var(--dark-text, #24211C) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    margin: 6px 0 2px !important;
    line-height: 1.2 !important;
}
.wd-rec-price-row {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    margin-top: auto !important;
    padding-top: 4px !important;
}
.wd-rec-price { font-size: 0.82rem !important; font-weight: 800 !important; color: var(--dark-gold, #8A681F) !important; }
.wd-rec-add-btn {
    padding: 5px 10px !important;
    border-radius: 20px !important;
    background: linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #E6CA65 100%) !important;
    border: 1px solid #8A681F !important;
    color: #111827 !important;
    font-family: var(--font-sans, 'Inter', sans-serif) !important;
    font-size: 0.65rem !important;
    font-weight: 800 !important;
    letter-spacing: 0.02em !important;
    cursor: pointer !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(184,134,11,0.25) !important;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
}
.wd-rec-add-btn:hover {
    background: linear-gradient(135deg, #C59312 0%, #DFC04E 50%, #F0D77B 100%) !important;
    transform: translateY(-1px) scale(1.04) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 4px 10px rgba(184,134,11,0.4) !important;
}
.wd-rec-add-btn svg {
    width: 10px !important;
    height: 10px !important;
    stroke: currentColor !important;
    fill: currentColor !important;
}

.wd-move-bag-btn {
    padding: 7px 14px !important;
    border-radius: 20px !important;
    background: linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #E6CA65 100%) !important;
    border: 1px solid #8A681F !important;
    color: #111827 !important;
    font-family: var(--font-sans, 'Inter', sans-serif) !important;
    font-size: 0.68rem !important;
    font-weight: 800 !important;
    letter-spacing: 0.04em !important;
    cursor: pointer !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(184,134,11,0.25) !important;
    transition: all 0.2s ease !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
}
.wd-move-bag-btn:hover {
    background: linear-gradient(135deg, #C59312 0%, #DFC04E 50%, #F0D77B 100%) !important;
    transform: translateY(-1px) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 4px 12px rgba(184,134,11,0.38) !important;
}
.wd-move-bag-btn svg {
    width: 12px !important;
    height: 12px !important;
    stroke: currentColor !important;
    stroke-width: 2.2 !important;
    fill: none !important;
}

.wd-remove-btn {
    padding: 4px 10px !important;
    border-radius: 14px !important;
    background: #FEF2F2 !important;
    color: #DC2626 !important;
    border: 1px solid #FECACA !important;
    font-size: 0.68rem !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    text-decoration: none !important;
    margin-left: auto !important;
}
.wd-remove-btn:hover {
    background: #FEE2E2 !important;
    border-color: #F87171 !important;
    color: #B91C1C !important;
    transform: translateY(-1px) !important;
}
.wd-remove-btn svg {
    width: 11px !important;
    height: 11px !important;
    stroke: currentColor !important;
    stroke-width: 2.2 !important;
    fill: none !important;
}
</style>

<!-- ════════════ WISHLIST DRAWER MODAL ════════════ -->
<div class="wishlist-drawer-backdrop" id="wishlistDrawerModal" aria-hidden="true" role="dialog" aria-label="Wishlist Drawer" inert>
    <div class="wishlist-drawer-content">
        <div class="wd-header">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="/assets/images/logo.png" onerror="this.onerror=null; this.src='/assets/images/no-image.svg';" alt="DT Brand's" style="height:28px; width:auto; max-width:120px; object-fit:contain;">
                <div>
                    <h3 class="wd-title" style="margin:0; font-size:0.95rem;">Saved Wishlist</h3>
                    <span class="wd-subtitle" id="wishlistBadgeSub" style="font-size:0.56rem;">0 Saved Items</span>
                </div>
            </div>
            <button class="wd-close-btn" id="closeWishlistDrawerBtn" onclick="if(typeof window.closeWishlistDrawer==='function') window.closeWishlistDrawer();" aria-label="Close Wishlist" style="display:inline-flex; align-items:center; justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>

        <div class="wd-body" id="wishlistItemsWrap">
            <!-- Dynamic Items or Animated Empty Wishlist rendered via JS -->
        </div>
    </div>
</div>

<script>
/* ── Wishlist Controller with Smooth Auto-Slide & Touch/Mouse Drag ── */
(function() {
    function loadWishlist() {
        try {
            var raw = localStorage.getItem('dtbrands_wishlist');
            if (raw !== null) return JSON.parse(raw);
        } catch(e) {}
        return []; // Always start with empty wishlist for new visitors
    }

    function saveWishlist(list) {
        try {
            localStorage.setItem('dtbrands_wishlist', JSON.stringify(list));
        } catch(e) {}
        window.wishlistState = list;
        if (typeof window.updateGlobalBadges === 'function') window.updateGlobalBadges();
        if (typeof window.dtSyncBadges === 'function') window.dtSyncBadges('wish_render');
    }

    window.wishlistState = loadWishlist();

    var _wishRecRaf = 0;
    window.attachWishlistAutoSlider = function(track) {
        if (!track || track._wishlistAutoAttached) return;
        track._wishlistAutoAttached = true;

        var isPaused = false;
        var isDown = false;
        var startX = 0;
        var startScrollLeft = 0;
        var scrollSpeed = 0.6;

        function autoStep() {
            var modal = document.getElementById('wishlistDrawerModal');
            if (!modal || !modal.classList.contains('active') || !track.isConnected) {
                _wishRecRaf = 0;
                return;
            }
            if (!isPaused && !isDown) {
                track.scrollLeft += scrollSpeed;
                if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 1) {
                    track.scrollLeft = 0;
                }
            }
            _wishRecRaf = requestAnimationFrame(autoStep);
        }
        track._startAuto = function() {
            if (_wishRecRaf) cancelAnimationFrame(_wishRecRaf);
            var modal = document.getElementById('wishlistDrawerModal');
            if (modal && modal.classList.contains('active')) {
                _wishRecRaf = requestAnimationFrame(autoStep);
            }
        };
        track._startAuto();

        /* Desktop Mouse Drag */
        track.addEventListener('mouseenter', function() { isPaused = true; });
        track.addEventListener('mouseleave', function() {
            if (!isDown) isPaused = false;
            isDown = false;
            track.classList.remove('active-drag');
        });

        track.addEventListener('mousedown', function(e) {
            isDown = true;
            isPaused = true;
            track.classList.add('active-drag');
            startX = e.pageX - track.offsetLeft;
            startScrollLeft = track.scrollLeft;
        });

        window.addEventListener('mouseup', function() {
            if (isDown) {
                isDown = false;
                track.classList.remove('active-drag');
                setTimeout(function() { isPaused = false; }, 1800);
            }
        });

        track.addEventListener('mousemove', function(e) {
            if (!isDown) return;
            e.preventDefault();
            var x = e.pageX - track.offsetLeft;
            var walk = (x - startX) * 1.5;
            track.scrollLeft = startScrollLeft - walk;
        });

        /* Mobile Touch Swipe */
        track.addEventListener('touchstart', function() {
            isPaused = true;
        }, { passive: true });

        track.addEventListener('touchend', function() {
            setTimeout(function() { isPaused = false; }, 2000);
        }, { passive: true });
    };

    window.renderWishlist = function() {
        var wrap = document.getElementById('wishlistItemsWrap');

        if (!wrap) return;

        var items = window.wishlistState || [];

        if (items.length === 0) {
            if (wrap.dataset.emptyRendered === '1' && document.getElementById('wdRecTrack')) {
                if (typeof window.updateGlobalBadges === 'function') window.updateGlobalBadges();
                return;
            }
            wrap.dataset.emptyRendered = '1';

            /* Render Animated Floating Heart SVG Empty Wishlist + Recommended Product Slider */
            var products = window.allProducts || [
                { id: 2, name: 'Banarasi Zari Saree', price: 8499, image: '/assets/images/product2.png' },
                { id: 4, name: 'Georgette Bloom Saree', price: 3299, image: '/assets/images/product4.png' },
                { id: 6, name: 'Bridal Zardosi Lehenga', price: 24999, image: '/assets/images/product6.png' },
                { id: 7, name: 'Mustard Block Print', price: 1899, image: '/assets/images/product7.png' }
            ];

            var fullList = products.slice(0, 6);

            var sliderCardsHtml = fullList.map(function(p) {
                var imgSrc = p.image || p.img || '/assets/images/no-image.svg';
                return '<div class="wd-rec-card">' +
                    '<a href="/product.php?id=' + p.id + '" class="wd-rec-img-wrap" style="text-decoration:none;">' +
                        '<img src="' + imgSrc + '" alt="' + (p.name || 'Ethnic Saree') + '" class="wd-rec-img" loading="lazy" decoding="async" onerror="this.onerror=null; this.src=\'/assets/images/no-image.svg\';" />' +
                    '</a>' +
                    '<h5 class="wd-rec-title"><a href="/product.php?id=' + p.id + '" style="color:inherit;text-decoration:none;">' + (p.name || 'Ethnic Wear') + '</a></h5>' +
                    '<div class="wd-rec-price-row">' +
                        '<span class="wd-rec-price">₹' + Number(p.price || 2999).toLocaleString('en-IN') + '</span>' +
                        '<button class="wd-rec-add-btn" onclick="window.addRecToWishlist(' + p.id + ')"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg> <span>SAVE</span></button>' +
                    '</div>' +
                '</div>';
            }).join('');

            wrap.innerHTML =
                '<div class="wd-empty-container">' +
                    '<div class="wd-empty-icon-wrap">' +
                        '<div class="wd-empty-glow-ring"></div>' +
                        '<svg class="wd-empty-svg" viewBox="0 0 24 24">' +
                            '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>' +
                        '</svg>' +
                    '</div>' +
                    '<h4 class="wd-empty-title">YOUR WISHLIST IS EMPTY</h4>' +
                    '<p class="wd-empty-desc">Save your favorite ethnic luxury sarees, kurtis & lehengas to shop anytime.</p>' +
                    '<button class="wd-explore-btn" onclick="window.closeWishlistDrawer(); window.location.href=\'/shop.php\';">' +
                        '<span>EXPLORE CATALOGUE</span> <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>' +
                    '</button>' +
                    '<div class="wd-quick-cats">' +
                        '<a href="/shop.php?category=Saree" class="wd-quick-chip">Banarasi Sarees</a>' +
                        '<a href="/shop.php?category=Lehenga" class="wd-quick-chip">Bridal Lehengas</a>' +
                        '<a href="/shop.php?category=Kurti" class="wd-quick-chip">Kurti Sets</a>' +
                        '<a href="/shop.php?category=Gown" class="wd-quick-chip">Ethnic Gowns</a>' +
                    '</div>' +

                    '<div class="wd-recommend-section">' +
                        '<div class="wd-rec-head">' +
                            '<span style="display:inline-flex; align-items:center; gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>RECOMMENDED FOR YOU</span>' +
                            '<span style="font-size:0.65rem; opacity:0.8;">SWIPE &rsaquo;</span>' +
                        '</div>' +
                        '<div class="wd-rec-track" id="wdRecTrack">' +
                            sliderCardsHtml +
                        '</div>' +
                    '</div>' +

                    '<div class="wd-atelier-foot">' +
                        '<div class="wd-atelier-pill"><strong>Silk Mark</strong><span>100% Certified</span></div>' +
                        '<div class="wd-atelier-pill"><strong>Surat Mill</strong><span>Direct Pricing</span></div>' +
                        '<div class="wd-atelier-pill"><strong>Pan-India</strong><span>Fast Dispatch</span></div>' +
                    '</div>' +
                '</div>';

            setTimeout(function() {
                var track = document.getElementById('wdRecTrack');
                if (track) {
                    track.scrollLeft = 0;
                    window.attachWishlistAutoSlider(track);
                }
            }, 60);

        } else {
            wrap.dataset.emptyRendered = '0';
            var html = '<div class="wd-toolbar">' +
                '<span class="wd-toolbar-count">' + items.length + ' Saved Item' + (items.length === 1 ? '' : 's') + '</span>' +
                '<div class="wd-toolbar-actions">' +
                    '<button type="button" class="wd-move-all-btn" onclick="window.moveAllWishlistToBag()">Move All to Bag</button>' +
                    '<button type="button" class="wd-clear-btn" onclick="window.clearAllWishlist()">Clear</button>' +
                '</div>' +
            '</div>';
            items.forEach(function(item, idx) {
                var imgUrl = item.image || '/assets/images/no-image.svg';

                html += '<div class="wd-item" data-index="' + idx + '">' +
                    '<a href="/product.php?id=' + item.id + '"><img src="' + imgUrl + '" alt="' + item.name + '" class="wd-item-img" /></a>' +
                    '<div class="wd-item-info">' +
                        '<h4 class="wd-item-title"><a href="/product.php?id=' + item.id + '" style="color:inherit;text-decoration:none;">' + item.name + '</a></h4>' +
                        '<span class="wd-item-meta">' + (item.category || 'Ethnic Wear') + (item.fabric ? ' &bull; ' + item.fabric : '') + (item.color ? ' &bull; ' + item.color : '') + '</span>' +
                        '<span class="wd-item-price">₹' + Number(item.price || 0).toLocaleString('en-IN') + (item.old_price && item.old_price > item.price ? ' <span class="wd-item-old">₹' + Number(item.old_price).toLocaleString('en-IN') + '</span>' : '') + '</span>' +
                        '<div class="wd-actions">' +
                            '<button class="wd-move-bag-btn" onclick="window.moveToBag(' + idx + ')"><svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg> <span>MOVE TO BAG</span></button>' +
                            '<button class="wd-remove-btn" onclick="window.removeFromWishlist(' + idx + ')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> <span>Remove</span></button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });
            wrap.innerHTML = html;
        }

        if (typeof window.updateGlobalBadges === 'function') {
            window.updateGlobalBadges();
        }
    };

    window.addRecToWishlist = function(productId) {
        var products = window.allProducts || [];
        var p = products.find(function(x) { return x.id == productId; });
        if (p && typeof window.toggleWishlistProduct === 'function') {
            window.toggleWishlistProduct(p);
            if (typeof window.showToast === 'function') window.showToast('Saved ' + p.name + ' to wishlist');
        }
    };

    window.moveAllWishlistToBag = function() {
        var items = loadWishlist();
        if (!items.length) return;
        items.forEach(function(item) {
            if (typeof window.dtAddToCart === 'function') {
                window.dtAddToCart(item, { qty: 1, openDrawer: false });
            }
        });
        saveWishlist([]);
        window.renderWishlist();
        window.closeWishlistDrawer();
        if (typeof window.openCartDrawer === 'function') window.openCartDrawer();
        var csrfTok = (document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')) || window.DT_CSRF_TOKEN || '';
        fetch('/api/wishlist.php', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTok },
            body: JSON.stringify({ action: 'clear', csrf_token: csrfTok })
        }).catch(function(){});
    };

    window.clearAllWishlist = function() {
        saveWishlist([]);
        window.renderWishlist();
        var csrfTok = (document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')) || window.DT_CSRF_TOKEN || '';
        fetch('/api/wishlist.php', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTok },
            body: JSON.stringify({ action: 'clear', csrf_token: csrfTok })
        }).catch(function(){});
        if (typeof window.showToast === 'function') window.showToast('Wishlist cleared');
    };

    window.removeFromWishlist = function(idx) {
        window.wishlistState = loadWishlist();
        if (!window.wishlistState[idx]) return;
        var removed = window.wishlistState.splice(idx, 1)[0];
        saveWishlist(window.wishlistState);
        window.renderWishlist();
        if (typeof window.dtRemoveWishlistItem === 'function' && removed && removed.id) {
            window.dtRemoveWishlistItem(removed.id);
        }
        if (typeof window.showToast === 'function') window.showToast('Item removed from wishlist');
    };

    window.moveToBag = function(idx) {
        window.wishlistState = loadWishlist();
        if (!window.wishlistState[idx]) return;
        var item = window.wishlistState.splice(idx, 1)[0];
        saveWishlist(window.wishlistState);
        window.renderWishlist();

        if (typeof window.dtRemoveWishlistItem === 'function' && item && item.id) {
            window.dtRemoveWishlistItem(item.id);
        }
        if (typeof window.dtAddToCart === 'function') {
            window.dtAddToCart(item, { qty: 1, openDrawer: true });
        } else if (typeof window.addToCart === 'function') {
            window.addToCart(item);
        }
        window.closeWishlistDrawer();
    };

        window.toggleWishlistProduct = function(productOrId) {
        if (!productOrId) return false;
        if (typeof window.dtToggleWishlist === 'function') {
            return window.dtToggleWishlist(productOrId);
        }
        window.wishlistState = loadWishlist();
        var p = (typeof productOrId === 'object' && productOrId !== null) ? productOrId :
            ((window.allProducts || window.catalogProducts || window.products || []).find(function(x) { return x.id == productOrId || String(x.id) === String(productOrId); }) || { id: productOrId, name: 'Saved Item', price: 2999, image: '/assets/images/no-image.svg' });
        
        var idx = (window.wishlistState || []).findIndex(function(item) { return item && (item.id == p.id || String(item.id) === String(p.id)); });
        var added = false;
        if (!Array.isArray(window.wishlistState)) window.wishlistState = [];

        if (idx > -1) {
            window.wishlistState.splice(idx, 1);
            added = false;
        } else {
            window.wishlistState.push(p);
            added = true;
        }
        saveWishlist(window.wishlistState);
        if (typeof window.renderWishlist === 'function') window.renderWishlist();
        return added;
    };

    window.openWishlistDrawer = function() {
        var modal = document.getElementById('wishlistDrawerModal');
        if (modal) {
            window.wishlistState = loadWishlist();
            if (typeof window.renderWishlist === 'function') window.renderWishlist();
            modal.removeAttribute('inert');
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            modal.style.setProperty('display', 'flex', 'important');
            modal.style.setProperty('opacity', '1', 'important');
            modal.style.setProperty('visibility', 'visible', 'important');
            modal.style.setProperty('pointer-events', 'auto', 'important');
            if (typeof window.dtSyncBodyScrollLock === 'function') {
                window.dtSyncBodyScrollLock();
            } else {
                document.body.style.overflow = 'hidden';
            }
            setTimeout(function() {
                var t = document.getElementById('wdRecTrack');
                if (t) {
                    t.scrollLeft = 0;
                    if (typeof t._startAuto === 'function') t._startAuto();
                }
            }, 20);
        }
    };

    window.closeWishlistDrawer = function() {
        var modal = document.getElementById('wishlistDrawerModal');
        if (modal) {
            if (document.activeElement && modal.contains(document.activeElement)) {
                document.activeElement.blur();
            }
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            modal.setAttribute('inert', '');
            modal.style.removeProperty('display');
            modal.style.removeProperty('opacity');
            modal.style.removeProperty('visibility');
            modal.style.removeProperty('pointer-events');
            if (typeof window.dtSyncBodyScrollLock === 'function') {
                window.dtSyncBodyScrollLock();
            } else {
                document.body.style.overflow = '';
            }
        }
    };

    window.openWishlist = window.openWishlistDrawer;
    window.closeWishlist = window.closeWishlistDrawer;

    /* Bind events on DOM Load */
    document.addEventListener('DOMContentLoaded', function() {
        window.renderWishlist();

        var closeBtn = document.getElementById('closeWishlistDrawerBtn');
        if (closeBtn) closeBtn.addEventListener('click', window.closeWishlistDrawer);

        var modal = document.getElementById('wishlistDrawerModal');
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) window.closeWishlistDrawer();
            });
        }
    });

    /* Initial sync call */
    setTimeout(function() {
        window.renderWishlist();
    }, 50);
})();
</script>
