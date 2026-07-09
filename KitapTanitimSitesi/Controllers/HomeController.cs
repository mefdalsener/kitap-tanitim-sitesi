using KitapTanitimSitesi.Models;
using Microsoft.AspNetCore.Mvc;

namespace KitapTanitimSitesi.Controllers
{
    public class HomeController : Controller
    {
        public IActionResult Index()
        {
            return View("HomeIndex");
        }
    }
}