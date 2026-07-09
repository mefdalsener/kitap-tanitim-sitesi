using Microsoft.EntityFrameworkCore;
using KitapTanitimSitesi.Models;

namespace KitapTanitimSitesi.Services
{
    public class EntityResolverService
    {
        public async Task<int> ResolvePublisherAsync(PublisherInput input, AppDbContext db)
        {
            if (input.Id.HasValue) return input.Id.Value;
            var newPublisher = new Publisher { PublisherName = input.Name };
            db.Publishers.Add(newPublisher);
            await db.SaveChangesAsync();
            return newPublisher.PublisherID;
        }

        public async Task<int> ResolveGenreAsync(string genreName, AppDbContext db)
        {
            var existing = await db.Genres.FirstOrDefaultAsync(g => g.GenreName == genreName);
            if (existing != null) return existing.GenreID;
            var newGenre = new Genre { GenreName = genreName };
            db.Genres.Add(newGenre);
            await db.SaveChangesAsync();
            return newGenre.GenreID;
        }
    }
}