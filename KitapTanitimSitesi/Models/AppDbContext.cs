using Microsoft.EntityFrameworkCore;

namespace KitapTanitimSitesi.Models
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<Book> Books { get; set; }
        public DbSet<Author> Authors { get; set; }
        public DbSet<Publisher> Publishers { get; set; }
        public DbSet<Genre> Genres { get; set; }
        public DbSet<Series> Series { get; set; }
        public DbSet<BookAuthor> BookAuthors { get; set; }
        public DbSet<BookGenre> BookGenres { get; set; }
        public DbSet<BookPublisher> BookPublishers { get; set; }
        public DbSet<Translator> Translators { get; set; }
        public DbSet<BookTranslator> BookTranslators { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Ara tabloların composite primary key tanımları
            modelBuilder.Entity<BookAuthor>()
                .HasKey(ba => new { ba.BookID, ba.AuthorID });

            modelBuilder.Entity<BookGenre>()
                .HasKey(bg => new { bg.BookID, bg.GenreID });

            modelBuilder.Entity<BookPublisher>()
                .HasKey(bp => new { bp.BookID, bp.PublisherID });

            modelBuilder.Entity<BookTranslator>()
                .HasKey(bt => new { bt.BookID, bt.TranslatorID });
        }
    }
}