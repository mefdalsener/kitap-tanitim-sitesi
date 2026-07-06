using KitapTanitimSitesi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace KitapTanitimSitesi.Controllers
{
    public class BooklandController : Controller
    {
        private readonly AppDbContext _context;

        public BooklandController(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IActionResult> Index()
        {
            var viewModel = new BooklandViewModel
            {
                Books = await _context.Books
                    .Include(b => b.BookAuthors)
                        .ThenInclude(ba => ba.Author)
                    .Include(b => b.BookGenres)
                        .ThenInclude(bg => bg.Genre)
                    .Include(b => b.BookPublishers)
                        .ThenInclude(bp => bp.Publisher)
                    .Include(b => b.BookTranslators)
                        .ThenInclude(bt => bt.Translator)
                    .ToListAsync(),

                Authors = await _context.Authors
                    .OrderBy(a => a.AuthorName)
                    .ToListAsync(),

                Publishers = await _context.Publishers
                    .OrderBy(p => p.PublisherName)
                    .ToListAsync(),

                Translators = await _context.Translators
                    .OrderBy(t => t.TranslatorName)
                    .ToListAsync(),

                Genres = await _context.Genres
                    .OrderBy(g => g.GenreName)
                    .ToListAsync(),

                SeriesList = await _context.Series
                    .OrderBy(s => s.SeriesName)
                    .ToListAsync(),

                PageCounts = await _context.BookPublishers
                    .Where(bp => bp.PageCount.HasValue)
                    .Select(bp => bp.PageCount.Value)
                    .Distinct()
                    .OrderBy(p => p)
                    .ToListAsync()
            };

            return View(viewModel);
        }
    }
}