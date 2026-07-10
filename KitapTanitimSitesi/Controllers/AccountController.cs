using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KitapTanitimSitesi.Models;
using KitapTanitimSitesi.Models.ViewModels;

namespace KitapTanitimSitesi.Controllers
{
    public class AccountController : Controller
    {
        private readonly AppDbContext _context;

        public AccountController(AppDbContext context)
        {
            _context = context;
        }

        // GET: /Account/Register
        [HttpGet]
        public IActionResult Register()
        {
            return View(new SignupIndex());
        }

        // POST: /Account/Register
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Register(SignupIndex model)
        {
            if (!ModelState.IsValid)
                return View(model);

            // Username veya Email zaten kayıtlı mı kontrol et
            var existingUser = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == model.Username || u.Email == model.Email);

            if (existingUser != null)
            {
                if (existingUser.Username == model.Username)
                    ModelState.AddModelError(nameof(model.Username), "Bu kullanıcı adı zaten kayıtlı.");
                if (existingUser.Email == model.Email)
                    ModelState.AddModelError(nameof(model.Email), "Bu e-posta zaten kayıtlı.");

                return View(model);
            }

            // Şifreyi BCrypt ile hash'le
            var user = new User
            {
                Username = model.Username,
                Email = model.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(model.Password),
                Role = "user",
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            // Kayıt sonrası otomatik giriş yapmak istersen burada SignInAsync çağrılabilir
            // (şimdilik metinde belirtilmediği için Login sayfasına yönlendiriyoruz)
            return RedirectToAction("Login");
        }

        // GET: /Account/Login
        [HttpGet]
        public IActionResult Login()
        {
            return View(new LoginIndex());
        }

        // POST: /Account/Login
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Login(LoginIndex model)
        {
            if (!ModelState.IsValid)
                return View(model);

            var input = model.UsernameOrEmail;

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == input || u.Email == input);

            // Kullanıcı bulunamadı VEYA şifre yanlış -> aynı genel mesaj (güvenlik amaçlı ayrım yapılmaz)
            if (user == null || !BCrypt.Net.BCrypt.Verify(model.Password, user.PasswordHash))
            {
                ModelState.AddModelError("", "Hatalı giriş yaptınız veya kayıtlı kullanıcı bulunamadı.");
                return View(model);
            }

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Role, user.Role)
            };

            var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);

            await HttpContext.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(claimsIdentity),
                new AuthenticationProperties
                {
                    IsPersistent = true,
                    ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7)
                });

            return RedirectToAction("Index", "Bookland");
        }

        // POST: /Account/Logout
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return RedirectToAction("Index", "Bookland");
        }
    }
}