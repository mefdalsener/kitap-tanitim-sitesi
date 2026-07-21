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
        public DbSet<User> Users { get; set; }
        public DbSet<BookRating> BookRatings { get; set; }

        // ---- YENİ: Faz Ekstra 2.0 ----
        public DbSet<UserModerationAction> UserModerationActions { get; set; }
        public DbSet<Report> Reports { get; set; }


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

            // User tablosunda Username ve Email alanları benzersiz (unique) olmalı
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Username)
                .IsUnique();

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            // ---- GÜNCELLENDİ (Faz Ekstra 2.0): sadece silinmemiş satırlar arasında
            // unique — soft-delete edilen bir yorumdan sonra kullanıcı yeniden
            // yorum+puan girebilsin diye filtered index'e çevrildi. ----
            modelBuilder.Entity<BookRating>()
                .HasIndex(br => new { br.BookID, br.UserID })
                .IsUnique()
                .HasFilter("[IsDeleted] = 0");

            modelBuilder.Entity<User>()
                .HasIndex(u => u.PublicId)
                .IsUnique();

            // ---- YENİ (Faz Ekstra 2.0): BookRating soft-delete FK ----
            // Restrict: silinmiş bir yorumun kaydı hangi admin tarafından
            // silindiğine dair kanıt olarak kalmalı, o admin User tablosundan
            // silinemesin.
            modelBuilder.Entity<BookRating>()
                .HasOne(br => br.DeletedByAdmin)
                .WithMany()
                .HasForeignKey(br => br.DeletedByAdminId)
                .OnDelete(DeleteBehavior.Restrict);

            // ---- YENİ (Faz Ekstra 2.0): UserModerationAction ilişkileri ----
            // Tüm User FK'leri Restrict: append-only geçmiş tablosu olduğu için
            // hiçbir satır, ilişkili bir User silinince kademeli silinmemeli.
            modelBuilder.Entity<UserModerationAction>()
                .HasOne(uma => uma.User)
                .WithMany()
                .HasForeignKey(uma => uma.UserID)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<UserModerationAction>()
                .HasOne(uma => uma.CreatedByAdmin)
                .WithMany()
                .HasForeignKey(uma => uma.CreatedByAdminId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<UserModerationAction>()
                .HasOne(uma => uma.RelatedRating)
                .WithMany()
                .HasForeignKey(uma => uma.RelatedRatingID)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<UserModerationAction>()
                .HasOne(uma => uma.RelatedReport)
                .WithMany(r => r.ModerationActions)
                .HasForeignKey(uma => uma.RelatedReportID)
                .OnDelete(DeleteBehavior.Restrict);

            // ---- YENİ (Faz Ekstra 2.0): Report ilişkileri ----
            modelBuilder.Entity<Report>()
                .HasOne(r => r.TargetRating)
                .WithMany()
                .HasForeignKey(r => r.TargetRatingID)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Report>()
                .HasOne(r => r.ReporterUser)
                .WithMany()
                .HasForeignKey(r => r.ReporterUserID)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Report>()
                .HasOne(r => r.ReviewedByAdmin)
                .WithMany()
                .HasForeignKey(r => r.ReviewedByAdminId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}